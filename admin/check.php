<?php
/* Setup check. Open /admin/check.php once after uploading, then delete this file. Shows only Yes/No. */
header('Content-Type: text/plain; charset=utf-8');
header('X-Robots-Tag: noindex');
$root = dirname(__DIR__);
function yn($b) { return $b ? 'YES' : 'NO  <-- needs fixing'; }
echo "Bloom admin setup check\n=======================\n";
echo "PHP 7.4 or newer (" . PHP_VERSION . "):      " . yn(version_compare(PHP_VERSION, '7.4', '>=')) . "\n";
echo "Image tools (GD) available:        " . yn(function_exists('imagecreatefromstring')) . "\n";
echo "File type detection available:     " . yn(class_exists('finfo')) . "\n";
echo "Sessions available:                " . yn(function_exists('session_start')) . "\n";
echo "content/site.json readable:        " . yn(is_readable($root . '/content/site.json')) . "\n";
echo "content/ folder writable:          " . yn(is_writable($root . '/content')) . "\n";
echo "content/site.json writable:        " . yn(is_writable($root . '/content/site.json')) . "\n";
echo "uploads/ folder writable:          " . yn(is_writable($root . '/uploads')) . "\n";
echo "admin/data/ folder writable:       " . yn(is_writable(__DIR__ . '/data')) . "\n";
echo "admin/data/backups/ writable:      " . yn(is_writable(__DIR__ . '/data/backups')) . "\n";
echo "Login file present:                " . yn(is_file(__DIR__ . '/data/auth.php')) . "\n";
echo "Secure connection (https):         " . ((!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'YES' : "NO  <-- turn on SSL for your domain in cPanel, then use https://") . "\n";
echo "Max upload size allowed:           " . ini_get('upload_max_filesize') . "\n";
echo "\nDelete admin/check.php when everything says YES.\n";
