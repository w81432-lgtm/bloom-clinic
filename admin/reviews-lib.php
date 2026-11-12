<?php
/* Google reviews helper, shared by api.php (admin buttons) and cron-reviews.php (daily refresh).
   Uses the Google Places API (New). The API key is stored in admin/data/google.php and is never sent to the browser. */

function gr_cfg_file(): string { return __DIR__ . '/data/google.php'; }

function gr_load(): array {
    $f = gr_cfg_file();
    if (!is_file($f)) return [];
    $raw = (string)file_get_contents($f);
    $nl = strpos($raw, "\n");
    $a = json_decode($nl === false ? '' : substr($raw, $nl + 1), true);
    return is_array($a) ? $a : [];
}
function gr_save(array $a): void {
    $f = gr_cfg_file();
    $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, "<?php http_response_code(404); exit;\n" . json_encode($a), LOCK_EX);
    rename($tmp, $f);
    @chmod($f, 0600);
}

/* One HTTPS request to Google. $base can be overridden in google.php ("base") for local testing only. */
function gr_http(string $method, string $path, array $headers, ?array $body, array $cfg): array {
    $base = $cfg['base'] ?? 'https://places.googleapis.com';
    $url = rtrim($base, '/') . $path;
    $hdr = array_merge(['Content-Type: application/json', 'X-Goog-Api-Key: ' . ($cfg['key'] ?? '')], $headers);
    $payload = $body === null ? null : json_encode($body, JSON_UNESCAPED_UNICODE);
    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 20, CURLOPT_CONNECTTIMEOUT => 10, CURLOPT_HTTPHEADER => $hdr, CURLOPT_CUSTOMREQUEST => $method]);
        if ($payload !== null) curl_setopt($ch, CURLOPT_POSTFIELDS, $payload);
        $out = curl_exec($ch);
        $code = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $err = curl_error($ch);
        curl_close($ch);
        if ($out === false) throw new RuntimeException('Could not reach Google: ' . $err);
    } else {
        $ctx = stream_context_create(['http' => ['method' => $method, 'header' => implode("\r\n", $hdr), 'content' => $payload ?? '', 'timeout' => 20, 'ignore_errors' => true]]);
        $out = @file_get_contents($url, false, $ctx);
        if ($out === false) throw new RuntimeException('Could not reach Google (the server may block outgoing connections).');
        $code = 0;
        foreach ($http_response_header ?? [] as $h) if (preg_match('#^HTTP/\S+ (\d+)#', $h, $m)) $code = (int)$m[1];
    }
    $j = json_decode((string)$out, true);
    if ($code >= 400 || !is_array($j)) {
        $msg = is_array($j) ? ($j['error']['message'] ?? 'Google returned an error.') : 'Google sent an unexpected reply.';
        throw new RuntimeException("Google said ($code): $msg");
    }
    return $j;
}

/* Find places by name, so the owner can pick the right Place ID. */
function gr_find(string $query, array $cfg): array {
    if (empty($cfg['key'])) throw new RuntimeException('Save your Google API key first.');
    $j = gr_http('POST', '/v1/places:searchText', ['X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress'], ['textQuery' => $query, 'maxResultCount' => 5], $cfg);
    $out = [];
    foreach ($j['places'] ?? [] as $p) $out[] = ['id' => $p['id'] ?? '', 'name' => $p['displayName']['text'] ?? '', 'address' => $p['formattedAddress'] ?? ''];
    return $out;
}

/* Fetch rating and reviews, then merge into content/site.json. Google-sourced reviews are replaced on each refresh
   (Google limits how long review text may be kept); reviews added by hand are never touched. */
function gr_refresh(string $contentFile, string $backupDir): array {
    $cfg = gr_load();
    if (empty($cfg['key']) || empty($cfg['placeId'])) throw new RuntimeException('Add your API key and Place ID first.');
    $placeId = preg_replace('/[^A-Za-z0-9_-]/', '', (string)$cfg['placeId']);
    $minStars = max(1, min(5, (int)($cfg['minStars'] ?? 5)));
    try {
        $j = gr_http('GET', '/v1/places/' . $placeId, ['X-Goog-FieldMask: displayName,rating,userRatingCount,reviews,googleMapsUri'], null, $cfg);
    } catch (Throwable $e) {
        $cfg['lastError'] = $e->getMessage(); $cfg['lastTry'] = time(); gr_save($cfg);
        throw $e;
    }
    $content = json_decode((string)@file_get_contents($contentFile), true);
    if (!is_array($content) || !isset($content['reviews'])) throw new RuntimeException('content/site.json is missing or damaged.');
    $R = $content['reviews'];
    $old = [];
    foreach ($R['items'] ?? [] as $it) if (($it['src'] ?? '') === 'google' && !empty($it['id'])) $old[$it['id']] = $it;
    $manual = array_values(array_filter($R['items'] ?? [], fn($it) => ($it['src'] ?? '') !== 'google'));
    $fresh = [];
    foreach ($j['reviews'] ?? [] as $r) {
        $stars = (int)($r['rating'] ?? 0);
        $text = trim((string)($r['originalText']['text'] ?? $r['text']['text'] ?? ''));
        $name = trim((string)($r['authorAttribution']['displayName'] ?? ''));
        $id = (string)($r['name'] ?? '');
        if ($stars < $minStars || $text === '' || $name === '' || $id === '') continue;
        $fresh[] = ['src' => 'google', 'id' => $id, 'name' => $name, 'stars' => $stars, 'date' => (string)($r['relativePublishTimeDescription'] ?? ''), 'text' => $text, 'hidden' => !empty($old[$id]['hidden'])];
    }
    $R['items'] = array_merge($fresh, $manual);
    if (isset($j['rating'])) $R['rating'] = number_format((float)$j['rating'], 1, '.', '');
    if (isset($j['userRatingCount'])) $R['count'] = (string)(int)$j['userRatingCount'];
    $R['link'] = 'https://search.google.com/local/reviews?placeid=' . $placeId;
    $content['reviews'] = $R;
    $json = json_encode($content, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) throw new RuntimeException('Could not encode the content.');
    if (!is_dir($backupDir)) @mkdir($backupDir, 0755, true);
    @copy($contentFile, $backupDir . '/site-' . date('Ymd-His') . '-' . substr(bin2hex(random_bytes(2)), 0, 4) . '.json');
    $files = glob($backupDir . '/site-*.json') ?: []; sort($files);
    while (count($files) > 40) @unlink(array_shift($files));
    $tmp = $contentFile . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $json, LOCK_EX) === false || !rename($tmp, $contentFile)) throw new RuntimeException('Could not save content/site.json. Check folder permissions.');
    $cfg['lastFetch'] = time(); $cfg['lastError'] = ''; $cfg['lastCount'] = count($fresh);
    gr_save($cfg);
    return ['added' => count($fresh), 'rating' => $R['rating'] ?? '', 'count' => $R['count'] ?? ''];
}
