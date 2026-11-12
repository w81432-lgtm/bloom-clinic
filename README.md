# Bloom Aesthetic and Laser Clinic: website and admin

A static single-page website (`index.html`) driven by `content/site.json` (English) and `content/site.ar.json` (Arabic), plus a small PHP admin at `/admin/` for editing the content. No database.

## Try it locally
```
php admin/tools/make-auth.php "ChooseAPassword123"
php -S localhost:8000
```
Website: http://localhost:8000/ Admin: http://localhost:8000/admin/ (username `admin`).

Needs PHP 7.4+ with GD, fileinfo and sessions. GitHub Pages can show the website but cannot run the admin (PHP).

## Folders
- `index.html`, `images/`: the website
- `content/`: all text and settings (the admin edits `site.json`; Arabic text is in `site.ar.json`)
- `uploads/`: photos uploaded from the admin
- `admin/`: the admin panel (`api.php`, `app.js`, `app.css`, `index.php`); `admin/check.php` is a setup check, delete it after use
- `SETUP.txt`: cPanel upload guide

`admin/data/auth.php` (the login file) is deliberately not in the repository. Create it with `admin/tools/make-auth.php`.
