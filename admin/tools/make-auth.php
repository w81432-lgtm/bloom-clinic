<?php
/* Creates admin/data/auth.php. Run from the command line only:
   php admin/tools/make-auth.php "YourNewPassword" [username]
   Or upload this file's output location by running it on your computer, then upload admin/data/auth.php. */
if (PHP_SAPI !== 'cli') { http_response_code(404); exit; }
$pw = $argv[1] ?? '';
$user = $argv[2] ?? 'admin';
if (strlen($pw) < 10) { fwrite(STDERR, "Use a password of at least 10 characters.\n"); exit(1); }
$a = ['user' => $user, 'hash' => password_hash($pw, PASSWORD_DEFAULT), 'must_change' => false];
$f = __DIR__ . '/../data/auth.php';
file_put_contents($f, "<?php http_response_code(404); exit;\n" . json_encode($a), LOCK_EX);
echo "Wrote $f\n";
