<?php
declare(strict_types=1);

/* Bloom Clinic admin API. One file, no database. Content lives in ../content/site.json */

const MAX_BODY = 3000000;          // 3 MB of JSON
const MAX_UPLOAD = 8000000;        // 8 MB per image
const KEEP_BACKUPS = 40;
const IDLE_SECONDS = 7200;         // sign out after 2 hours idle

$ROOT = dirname(__DIR__);
$DATA = __DIR__ . '/data';
$CONTENT = $ROOT . '/content/site.json';
$UPLOADS = $ROOT . '/uploads';
$AUTH = $DATA . '/auth.php';
$ATTEMPTS = $DATA . '/attempts.php';
$BACKUPS = $DATA . '/backups';

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: same-origin');

function out($data, int $code = 200) {
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function fail(string $msg, int $code = 400) { out(['ok' => false, 'error' => $msg], $code); }

/* ---------- session ---------- */
$https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
session_name('bloomadmin');
session_set_cookie_params(['lifetime' => 0, 'path' => '/', 'secure' => $https, 'httponly' => true, 'samesite' => 'Strict']);
ini_set('session.use_strict_mode', '1');
session_start();
if (!empty($_SESSION['last']) && time() - $_SESSION['last'] > IDLE_SECONDS) {
    $_SESSION = [];
    session_regenerate_id(true);
}
$_SESSION['last'] = time();
if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(24));
$authed = !empty($_SESSION['auth']);

$action = $_GET['action'] ?? '';
$isPost = $_SERVER['REQUEST_METHOD'] === 'POST';

if ($isPost) {
    $tok = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!hash_equals($_SESSION['csrf'], $tok)) fail('Your session expired. Reload the page and try again.', 403);
}

/* ---------- helpers ---------- */
/* Small private data files: a PHP guard line (so a browser sees nothing) followed by JSON.
   Read as plain text, never include()d, so PHP's opcache can never serve a stale copy. */
function load_auth(string $f): array {
    if (!is_file($f)) return [];
    $raw = (string)file_get_contents($f);
    $nl = strpos($raw, "\n");
    $a = json_decode($nl === false ? '' : substr($raw, $nl + 1), true);
    return is_array($a) ? $a : [];
}
function save_php_array(string $f, array $a): void {
    $tmp = $f . '.' . bin2hex(random_bytes(4)) . '.tmp';
    file_put_contents($tmp, "<?php http_response_code(404); exit;\n" . json_encode($a), LOCK_EX);
    rename($tmp, $f);
}
function client_ip(): string { return $_SERVER['REMOTE_ADDR'] ?? 'unknown'; }

function atomic_write(string $file, string $data): void {
    $tmp = $file . '.' . bin2hex(random_bytes(4)) . '.tmp';
    if (file_put_contents($tmp, $data, LOCK_EX) === false) fail('Could not write the file. Check folder permissions.', 500);
    if (!rename($tmp, $file)) { @unlink($tmp); fail('Could not save the file. Check folder permissions.', 500); }
}

function make_backup(string $content, string $dir): void {
    if (!is_file($content)) return;
    if (!is_dir($dir)) @mkdir($dir, 0755, true);
    $name = 'site-' . date('Ymd-His') . '-' . substr(bin2hex(random_bytes(2)), 0, 4) . '.json';
    @copy($content, $dir . '/' . $name);
    $files = glob($dir . '/site-*.json') ?: [];
    sort($files);
    while (count($files) > KEEP_BACKUPS) @unlink(array_shift($files));
}

/* structural checks so a bad save can never break the public site */
function validate_content($c): ?string {
    if (!is_array($c)) return 'Content is not valid.';
    foreach (['site', 'home', 'tourism', 'about', 'gallery', 'reviews', 'specialistsPage'] as $k)
        if (!isset($c[$k]) || !is_array($c[$k])) return "Missing section: $k";
    foreach (['areas', 'treatments', 'featured', 'offers', 'team', 'directors'] as $k)
        if (!isset($c[$k]) || !is_array($c[$k]) || (count($c[$k]) && array_keys($c[$k]) !== range(0, count($c[$k]) - 1))) return "Missing list: $k";
    foreach (['name', 'phone', 'phoneTel', 'email', 'address'] as $k)
        if (!isset($c['site'][$k]) || !is_string($c['site'][$k])) return "Missing contact detail: $k";
    if (!isset($c['site']['hours']) || !is_array($c['site']['hours'])) return 'Missing opening hours.';
    foreach ($c['site']['hours'] as $h) {
        if (!is_array($h) || !isset($h['day'])) return 'Opening hours are not valid.';
        if (empty($h['closed']) && (!preg_match('/^\d{1,2}:\d{2}$/', (string)($h['open'] ?? '')) || !preg_match('/^\d{1,2}:\d{2}$/', (string)($h['close'] ?? ''))))
            return 'Set an opening and closing time for ' . $h['day'] . ', or tick Closed.';
    }
    if (!count($c['areas'])) return 'Keep at least one service area.';
    $keys = [];
    foreach ($c['areas'] as $a) {
        if (!is_array($a) || !preg_match('/^[a-z0-9][a-z0-9-]{0,40}$/', (string)($a['key'] ?? ''))) return 'Each service area needs a web address name using lowercase letters, numbers and dashes.';
        if (isset($keys[$a['key']])) return 'Two service areas share the same web address name: ' . $a['key'];
        $keys[$a['key']] = 1;
        if (!isset($a['groups']) || !is_array($a['groups'])) return 'A service area has no treatment groups.';
        foreach ($a['groups'] as $g) {
            if (!is_array($g) || !isset($g['items']) || !is_array($g['items'])) return 'A treatment group is not valid.';
            foreach ($g['items'] as $it) if (!is_string($it)) return 'A treatment name is not valid.';
        }
    }
    $slugs = [];
    foreach ($c['treatments'] as $t) {
        if (!is_array($t) || !preg_match('/^[a-z0-9][a-z0-9-]{0,60}$/', (string)($t['slug'] ?? ''))) return 'Each treatment page needs a web address name using lowercase letters, numbers and dashes.';
        if (isset($slugs[$t['slug']])) return 'Two treatment pages share the same web address name: ' . $t['slug'];
        $slugs[$t['slug']] = 1;
        if (!isset($keys[$t['area'] ?? ''])) return 'Treatment page "' . ($t['name'] ?? $t['slug']) . '" is set to a service area that does not exist.';
        if (trim((string)($t['name'] ?? '')) === '') return 'Every treatment page needs a name.';
    }
    return null;
}

function list_images(string $root): array {
    $items = [];
    foreach (['images' => 'Site images', 'uploads' => 'Uploaded'] as $dir => $label) {
        foreach (glob("$root/$dir/*.{jpg,jpeg,png,webp,gif}", GLOB_BRACE) ?: [] as $f) {
            $b = basename($f);
            if ($dir === 'images' && (strpos($b, 'bloom-logo') === 0 || $b === 'favicon.png')) continue;
            $items[] = ['path' => "$dir/$b", 'name' => $b, 'group' => $label, 'time' => filemtime($f), 'size' => filesize($f), 'deletable' => $dir === 'uploads'];
        }
    }
    usort($items, fn($a, $b) => [$a['group'] === 'Uploaded' ? 0 : 1, -$a['time']] <=> [$b['group'] === 'Uploaded' ? 0 : 1, -$b['time']]);
    return $items;
}

/* ---------- public actions ---------- */
if ($action === 'me') {
    $a = load_auth($AUTH);
    out(['ok' => true, 'auth' => $authed, 'csrf' => $_SESSION['csrf'], 'mustChange' => $authed && !empty($a['must_change']), 'configured' => !empty($a['hash'])]);
}

if ($action === 'login' && $isPost) {
    $a = load_auth($AUTH);
    if (empty($a['hash'])) fail('The admin is not set up. Upload admin/data/auth.php from the package.', 500);
    $att = load_auth($ATTEMPTS);
    $ip = client_ip();
    $now = time();
    $rec = $att[$ip] ?? ['n' => 0, 't' => $now];
    if ($now - $rec['t'] > 900) $rec = ['n' => 0, 't' => $now];
    if ($rec['n'] >= 6) fail('Too many wrong attempts. Wait 15 minutes and try again.', 429);
    $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
    $user = (string)($body['user'] ?? '');
    $pass = (string)($body['password'] ?? '');
    $okUser = hash_equals((string)($a['user'] ?? 'admin'), $user);
    $okPass = password_verify($pass, $a['hash']);
    if ($okUser && $okPass) {
        unset($att[$ip]);
        save_php_array($ATTEMPTS, $att);
        session_regenerate_id(true);
        $_SESSION['auth'] = true;
        $_SESSION['csrf'] = bin2hex(random_bytes(24));
        $_SESSION['last'] = time();
        out(['ok' => true, 'csrf' => $_SESSION['csrf'], 'mustChange' => !empty($a['must_change'])]);
    }
    $rec['n']++;
    $att[$ip] = $rec;
    foreach ($att as $k => $v) if ($now - $v['t'] > 900) unset($att[$k]);
    save_php_array($ATTEMPTS, $att);
    usleep(400000);
    fail('Wrong username or password.', 401);
}

if ($action === 'logout' && $isPost) {
    $_SESSION = [];
    session_destroy();
    out(['ok' => true]);
}

/* ---------- everything below needs a signed-in admin ---------- */
if (!$authed) fail('Please sign in.', 401);

if ($action === 'load') {
    $raw = is_file($CONTENT) ? file_get_contents($CONTENT) : '';
    $c = json_decode($raw ?: '', true);
    if (!is_array($c)) fail('content/site.json is missing or damaged. Use Backups to restore, or re-upload it.', 500);
    out(['ok' => true, 'content' => $c, 'mtime' => filemtime($CONTENT)]);
}

if ($action === 'save' && $isPost) {
    if (!empty(load_auth($AUTH)['must_change'])) fail('Choose your own password first (Account).', 403);
    $raw = file_get_contents('php://input') ?: '';
    if (strlen($raw) > MAX_BODY) fail('That is too much content to save at once.', 413);
    $body = json_decode($raw, true);
    if (!is_array($body) || !isset($body['content'])) fail('Nothing to save.');
    if (!empty($body['mtime']) && is_file($CONTENT) && (int)$body['mtime'] < filemtime($CONTENT) && empty($body['force']))
        out(['ok' => false, 'conflict' => true, 'error' => 'The content was changed somewhere else since you opened it (another browser or person).'], 409);
    $err = validate_content($body['content']);
    if ($err) fail($err, 422);
    $json = json_encode($body['content'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    if ($json === false) fail('Content could not be encoded.', 422);
    make_backup($CONTENT, $BACKUPS);
    atomic_write($CONTENT, $json);
    clearstatcache();
    out(['ok' => true, 'mtime' => filemtime($CONTENT)]);
}

if ($action === 'media') {
    out(['ok' => true, 'items' => list_images($ROOT)]);
}

if ($action === 'upload' && $isPost) {
    if (!isset($_FILES['file']) || !is_uploaded_file($_FILES['file']['tmp_name'] ?? '')) {
        $e = $_FILES['file']['error'] ?? 0;
        fail($e === UPLOAD_ERR_INI_SIZE || $e === UPLOAD_ERR_FORM_SIZE ? 'That image is larger than the server allows. Try a smaller one (under ' . ini_get('upload_max_filesize') . ').' : 'No image received.');
    }
    $f = $_FILES['file'];
    if ($f['size'] > MAX_UPLOAD) fail('Images must be under 8 MB.');
    $fi = new finfo(FILEINFO_MIME_TYPE);
    $mime = $fi->file($f['tmp_name']);
    if (!in_array($mime, ['image/jpeg', 'image/png', 'image/webp', 'image/gif'], true)) fail('Use a JPG, PNG, WebP or GIF image.');
    if (!function_exists('imagecreatefromstring')) fail('This server cannot process images (PHP GD is missing).', 500);
    $info = @getimagesize($f['tmp_name']);
    if (!$info || $info[0] < 10 || $info[1] < 10 || $info[0] * $info[1] > 60000000) fail('That image could not be read.');
    $img = @imagecreatefromstring((string)file_get_contents($f['tmp_name']));
    if (!$img) fail('That image could not be read.');
    if ($mime === 'image/jpeg' && function_exists('exif_read_data')) {
        $ex = @exif_read_data($f['tmp_name']);
        $o = $ex['Orientation'] ?? 1;
        $rot = [3 => 180, 6 => -90, 8 => 90][$o] ?? 0;
        if ($rot) { $r = imagerotate($img, $rot, 0); if ($r) $img = $r; }
    }
    $w = imagesx($img); $h = imagesy($img); $max = 2000;
    if (max($w, $h) > $max) {
        $s = $max / max($w, $h);
        $n = imagecreatetruecolor((int)round($w * $s), (int)round($h * $s));
        imagealphablending($n, false); imagesavealpha($n, true);
        imagecopyresampled($n, $img, 0, 0, 0, 0, imagesx($n), imagesy($n), $w, $h);
        $img = $n;
    }
    $base = preg_replace('/[^a-z0-9]+/', '-', strtolower(pathinfo((string)$f['name'], PATHINFO_FILENAME)));
    $base = trim(substr($base, 0, 30), '-') ?: 'image';
    $keepAlpha = in_array($mime, ['image/png', 'image/gif'], true);
    $ext = $keepAlpha ? 'png' : 'jpg';
    $name = $base . '-' . substr(bin2hex(random_bytes(4)), 0, 6) . '.' . $ext;
    if (!is_dir($UPLOADS)) @mkdir($UPLOADS, 0755, true);
    $dest = $UPLOADS . '/' . $name;
    imagealphablending($img, false); imagesavealpha($img, true);
    $ok = $ext === 'png' ? imagepng($img, $dest, 7) : imagejpeg($img, $dest, 86);
    if (!$ok) fail('Could not save the image. Check that the uploads folder is writable.', 500);
    @chmod($dest, 0644);
    out(['ok' => true, 'path' => 'uploads/' . $name]);
}

if ($action === 'delete_media' && $isPost) {
    $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
    $p = (string)($body['path'] ?? '');
    if (!preg_match('#^uploads/[A-Za-z0-9._-]+$#', $p) || strpos($p, '..') !== false) fail('Only uploaded images can be deleted.');
    $file = $ROOT . '/' . $p;
    if (!is_file($file)) fail('That image no longer exists.', 404);
    $cur = is_file($CONTENT) ? file_get_contents($CONTENT) : '';
    if (strpos((string)$cur, $p) !== false) fail('That image is used on the website. Replace it first, then delete it.', 409);
    @unlink($file);
    out(['ok' => true]);
}

if ($action === 'backups') {
    $files = glob($BACKUPS . '/site-*.json') ?: [];
    rsort($files);
    $items = [];
    foreach ($files as $f) $items[] = ['name' => basename($f), 'time' => filemtime($f), 'size' => filesize($f)];
    out(['ok' => true, 'items' => $items]);
}

if ($action === 'restore' && $isPost) {
    $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
    $n = (string)($body['name'] ?? '');
    if (!preg_match('/^site-[0-9]{8}-[0-9]{6}-[0-9a-f]{4}\.json$/', $n)) fail('Not a valid backup.');
    $f = $BACKUPS . '/' . $n;
    if (!is_file($f)) fail('Backup not found.', 404);
    $c = json_decode((string)file_get_contents($f), true);
    if (validate_content($c) !== null) fail('That backup is damaged.', 422);
    make_backup($CONTENT, $BACKUPS);
    atomic_write($CONTENT, (string)file_get_contents($f));
    out(['ok' => true]);
}

if ($action === 'password' && $isPost) {
    $body = json_decode(file_get_contents('php://input') ?: '', true) ?: [];
    $a = load_auth($AUTH);
    if (!password_verify((string)($body['current'] ?? ''), (string)($a['hash'] ?? ''))) { usleep(400000); fail('Your current password is not right.', 403); }
    $new = (string)($body['new'] ?? '');
    $user = trim((string)($body['user'] ?? ($a['user'] ?? 'admin')));
    if (strlen($new) < 10) fail('Use at least 10 characters.');
    if (!preg_match('/^[A-Za-z0-9._@-]{3,40}$/', $user)) fail('The username can use letters, numbers and . _ @ - (3 to 40 characters).');
    if ($new === (string)($body['current'] ?? '')) fail('Choose a password different from the current one.');
    $a['hash'] = password_hash($new, PASSWORD_DEFAULT);
    $a['user'] = $user;
    $a['must_change'] = false;
    save_php_array($AUTH, $a);
    out(['ok' => true]);
}

/* ---------- Google reviews ---------- */
if (in_array($action, ['g_status', 'g_save', 'g_find', 'g_fetch'], true)) {
    require_once __DIR__ . '/reviews-lib.php';
    $g = gr_load();
    $body = $isPost ? (json_decode(file_get_contents('php://input') ?: '', true) ?: []) : [];
    if ($action === 'g_status') {
        out(['ok' => true, 'hasKey' => !empty($g['key']), 'placeId' => $g['placeId'] ?? '', 'minStars' => (int)($g['minStars'] ?? 5),
             'lastFetch' => $g['lastFetch'] ?? 0, 'lastError' => $g['lastError'] ?? '', 'lastCount' => $g['lastCount'] ?? 0, 'curl' => function_exists('curl_init')]);
    }
    if (!$isPost) fail('Use POST.', 405);
    if ($action === 'g_save') {
        if (!empty($body['key'])) {
            $k = trim((string)$body['key']);
            if (!preg_match('/^[A-Za-z0-9_\-]{20,100}$/', $k)) fail('That does not look like a Google API key.');
            $g['key'] = $k;
        }
        if (!empty($body['clearKey'])) unset($g['key']);
        $pid = trim((string)($body['placeId'] ?? ''));
        if ($pid !== '' && !preg_match('/^[A-Za-z0-9_\-]{10,200}$/', $pid)) fail('That does not look like a Place ID.');
        $g['placeId'] = $pid;
        $g['minStars'] = max(1, min(5, (int)($body['minStars'] ?? 5)));
        gr_save($g);
        out(['ok' => true]);
    }
    try {
        if ($action === 'g_find') {
            $q = trim((string)($body['query'] ?? ''));
            if ($q === '') fail('Type the business name to search for.');
            out(['ok' => true, 'places' => gr_find($q, $g)]);
        }
        if ($action === 'g_fetch') {
            $r = gr_refresh($CONTENT, $BACKUPS);
            clearstatcache();
            out(['ok' => true, 'added' => $r['added'], 'rating' => $r['rating'], 'count' => $r['count']]);
        }
    } catch (Throwable $e) {
        fail($e->getMessage(), 502);
    }
}

fail('Unknown action.', 404);
