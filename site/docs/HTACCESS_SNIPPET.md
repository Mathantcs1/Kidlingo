# .htaccess snippet for Bluehost (security, caching, redirects)

Status: written for Apache / LiteSpeed (Bluehost WordPress hosting runs one of them and reads `.htaccess`). It has **not been run against
a real server** in this build (the sandbox has only the Playground dev server, which ignores `.htaccess`). Check each line on the live site
after pasting it (see "Verify" at the end).

## Where it goes

Edit `public_html/.htaccess` (File Manager or SFTP). Paste the block **above** the line `# BEGIN WordPress`: WordPress rewrites everything
between its own markers and would delete anything pasted inside them. Make a copy of the file first.

## What PHP already sends (no `.htaccess` needed)

The IdeaToApps Core plugin (`includes/seo-headers.php`) sends these on every WordPress page (not on static files):

| Header | Value |
| --- | --- |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `SAMEORIGIN` |

It sends **no** HSTS and **no** Content-Security-Policy: HSTS cannot be undone quickly, and a CSP needs a per-site allow-list for Stripe and
WooCommerce scripts. Both are server-level decisions, documented below.

## The block

```apache
# ---- IdeaToApps: HTTPS, apex domain, headers, caching (paste above "# BEGIN WordPress") ----

<IfModule mod_rewrite.c>
RewriteEngine On

# 0. Never redirect certificate validation requests. Let's Encrypt style (ACME) and cPanel AutoSSL checks fetch a file over plain
#    HTTP from /.well-known/; a redirect to HTTPS (or to the apex) can make renewal fail. This rule stops all rewriting for them.
RewriteRule ^\.well-known/(acme-challenge|pki-validation)/ - [L]

# 1. PHASE B ONLY (after DNS points at Bluehost and https://ideatoapps.net opens): force HTTPS and redirect to the apex. Applied on the
#    temporary URL it redirects you to a domain that does not resolve to this server yet and locks you out of wp-admin.
#    (Bluehost's free SSL must be active first: open https://ideatoapps.net in a private window.)
RewriteCond %{HTTPS} !=on
RewriteCond %{HTTP:X-Forwarded-Proto} !=https
RewriteRule ^ https://ideatoapps.net%{REQUEST_URI} [L,R=301]

# 2. PHASE B ONLY: www -> apex (the canonical links and the sitemap use https://ideatoapps.net).
RewriteCond %{HTTP_HOST} ^www\.ideatoapps\.net$ [NC]
RewriteRule ^ https://ideatoapps.net%{REQUEST_URI} [L,R=301]
</IfModule>

<IfModule mod_headers.c>
# 3. Security headers for static files too (PHP already sends them for pages; "always" also covers errors).
Header always set X-Content-Type-Options "nosniff"
Header always set Referrer-Policy "strict-origin-when-cross-origin"
Header always set X-Frame-Options "SAMEORIGIN"
# Modern equivalent of the line above (optional; keep both, browsers use CSP when present).
# Header always set Content-Security-Policy "frame-ancestors 'self'"

# 4. HSTS: OPT-IN. Uncomment ONLY after HTTPS has worked on the apex AND www for a few days.
#    Start with the 5 minute line, then raise it. Do not add "preload" unless you understand it is hard to reverse.
# Header always set Strict-Transport-Security "max-age=300" env=HTTPS
# Header always set Strict-Transport-Security "max-age=31536000; includeSubDomains" env=HTTPS

# 5. Long cache for the theme's static files (CSS/JS carry ?ver=<file modification time>, so a changed file has a new URL;
#    the font file name has no version query: rename the file if it is ever replaced).
<If "%{REQUEST_URI} =~ m#^/wp-content/themes/ideatoapps/assets/#">
	Header set Cache-Control "public, max-age=31536000, immutable"
</If>
# Uploaded media: a month. (HTML pages are NOT given a cache header here: leave that to a caching plugin if you add one.)
<If "%{REQUEST_URI} =~ m#^/wp-content/uploads/.*\.(jpe?g|png|gif|webp|avif)$#">
	Header set Cache-Control "public, max-age=2592000"
</If>
</IfModule>

# 6. Compression for text (skip if Bluehost already compresses: check the response header "content-encoding").
<IfModule mod_deflate.c>
AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json application/xml image/svg+xml
</IfModule>

# ---- end IdeaToApps ----
```

## Notes

- **Rules 1 and 2 (redirect to `https://ideatoapps.net`) are Phase B only**: apply them after DNS points at Bluehost and the apex works
  (`DEPLOYMENT_BLUEHOST.md`, sections 2, 5 and 6). While you build on the temporary URL, leave them out (rules 0 and 3 to 6 are safe).

- Rule 0 keeps `/.well-known/acme-challenge/` (and cPanel's `/.well-known/pki-validation/`) out of both redirects, so a certificate
  can be issued or renewed over plain HTTP. Which of the two folders your Bluehost certificate check uses is unverified; the rule covers both.
  After the first renewal cycle (or after asking Bluehost to re-run AutoSSL) check that the certificate dates moved forward.

- The caching rules (5) use `<If>`, which needs Apache 2.4 (LiteSpeed accepts it too). If the server answers 500 after pasting, delete rule 5
  and keep the rest: it is only an optimisation.
- Never cache `/cart/`, `/checkout/` or `/my-account/` at a CDN or caching plugin. WooCommerce sends no-cache headers for them; keep it that way.
- Cloudflare or another proxy in front: its own redirect and HSTS settings apply too. Also read the client-IP note in `ENVIRONMENT.md`.
- `Header always set Referrer-Policy` and PHP's header are the same value on purpose; if two different values ever appear, the server's value wins.
- The theme-colour meta tags (light and dark) follow the visitor's operating-system colour setting. A meta tag cannot react to the
  on-page theme toggle, so a visitor who overrides the theme in the page sees the browser bar in their OS colour. That is a known limit, not a bug.

## Verify after pasting (a few minutes, with a private window)

1. `http://ideatoapps.net`, `https://www.ideatoapps.net` and `http://www.ideatoapps.net` each end up at `https://ideatoapps.net/` (one redirect).
2. `curl -I https://ideatoapps.net/` shows `x-content-type-options: nosniff`, `referrer-policy`, `x-frame-options`.
3. `curl -I https://ideatoapps.net/wp-content/themes/ideatoapps/assets/css/base.css?ver=1` shows `cache-control: ... max-age=31536000`.
4. `https://ideatoapps.net/robots.txt` lists the sitemap; `https://ideatoapps.net/sitemap.xml` opens (it redirects to `/wp-sitemap.xml`).
5. Only if you enabled HSTS: `curl -I https://ideatoapps.net/` shows `strict-transport-security`.
6. Certificate validation is not redirected: `curl -sI http://ideatoapps.net/.well-known/acme-challenge/test` answers 404 (or 403), **not** a 301 to https.
7. Re-run the security headers scan of your choice and PageSpeed Insights on the home page.
