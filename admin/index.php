<?php
header('X-Frame-Options: DENY');
header('X-Robots-Tag: noindex, nofollow');
header('Referrer-Policy: same-origin');
header('Cache-Control: no-store');
header("Content-Security-Policy: default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
$v = @filemtime(__DIR__ . '/app.js') ?: 1;
?><!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Bloom Clinic Admin</title>
<link rel="icon" type="image/png" href="../images/favicon.png">
<link rel="stylesheet" href="app.css?v=<?= $v ?>">
</head>
<body>
<div id="app"><p class="boot">Loading…</p></div>
<noscript><p class="boot">Turn on JavaScript to use the admin.</p></noscript>
<script src="app.js?v=<?= $v ?>"></script>
</body>
</html>
