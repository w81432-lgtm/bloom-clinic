<?php
/* Daily refresh of Google reviews. Command line only. In cPanel > Cron Jobs add (once a day), for example:
   /usr/local/bin/php /home/YOURUSER/public_html/admin/cron-reviews.php
   Adjust the path to where the site is installed. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
require __DIR__ . '/reviews-lib.php';
$root = dirname(__DIR__);
try {
    $r = gr_refresh($root . '/content/site.json', __DIR__ . '/data/backups');
    echo date('c') . " OK: {$r['added']} reviews, rating {$r['rating']} ({$r['count']} total)\n";
} catch (Throwable $e) {
    fwrite(STDERR, date('c') . ' ERROR: ' . $e->getMessage() . "\n");
    exit(1);
}
