# Local environment findings

Checked 2026-11-15 in the Claude Code sandbox.

| Check | Result |
| --- | --- |
| `php -v` | PHP 8.3.6 (CLI) |
| `node -v` | v22.23.4 |
| `docker --version` | 29.9.2 installed, but **no daemon** (`/var/run/docker.sock` missing) -> `wp-env` unusable here |
| `npx @wp-playground/cli` | 3.1.64 works (Node only) |
| Reachable hosts | npm registry, GitHub release assets, Packagist metadata, git over proxy |
| Blocked hosts (403) | wordpress.org, downloads.wordpress.org, wp-now.com, s.w.org, cdn.jsdelivr.net, playground.wordpress.net, github.com/*/archive and codeload |

## Chosen runner: WordPress Playground (CLI)

Playground normally downloads WordPress from wp-now.com / wordpress.org, which the sandbox blocks.
`scripts/wp-bootstrap.mjs` therefore fetches into `site/.wp/` (git-ignored):

- WordPress core 7.x through Composer (`johnpbloch/wordpress-core`, git transport)
- WooCommerce 11.3.0 from the GitHub release asset (override with `WC_VERSION`)

`scripts/wp-start.mjs` mounts that tree and starts Playground at http://localhost:8888 with
`blueprint.json` (activates WooCommerce, the `ideatoapps` theme and `ideatoapps-core`, title "IdeaToApps").
Theme: `wp-content/themes/ideatoapps/`, plugin: `wp-content/plugins/ideatoapps-core/` (mounted live).

On a machine with open internet and Docker, `wp-env` would also work; this setup works with Node, PHP and Composer only.

## Commands (run in `site/`)

- `npm install && composer install` once
- `npm run wp:start` start WordPress (first run downloads ~100 MB)
- `npm run test:e2e` Playwright (starts the server itself if none is running; uses `/opt/pw-browsers/chromium`, override with `PW_CHROMIUM_PATH`; never run `playwright install`)
- `npm run test:php` PHPUnit 11 (plain, WordPress not loaded)

## Writing WordPress-aware PHP tests

`npm run test:php` boots real WordPress 7.x (from `.wp/wordpress`) on a throw-away SQLite database
(`.wp/test-content/database/`, rebuilt every run, never the dev site DB) with WooCommerce, the `ideatoapps`
theme and the `ideatoapps-core` plugin loaded (`tests/php/bootstrap.php`, `env.php`, `install.php`).

- Prerequisite: `npm run wp:bootstrap` once (fetches WP core + WooCommerce into `.wp/`), plus `composer install`.
- Put tests in `tests/php/*Test.php` and extend `WPTestCase`. Every test runs in a DB transaction that is rolled
  back, with the object cache flushed and the current user reset, so posts, options, orders and users never leak.
- All WordPress and WooCommerce functions are available (`register_post_type`, `update_post_meta`,
  `wc_create_order`, WC data stores, ...). See `tests/php/WordPressBootTest.php` for a downloadable product + completed order example.
- Mail is stubbed (`pre_wp_mail`), external HTTP is blocked, cron is disabled. For downloadable files set
  `update_option( 'wc_downloads_approved_directories_mode', 'disabled' )` inside the test.
- DDL run inside a test is also rolled back (SQLite); keep schema creation in plugin activation/bootstrap code.
- Browser-level behaviour stays in Playwright (`tests/e2e`).

## Limitations

- Site state of the dev server is a sqlite DB under `.wp/wordpress/wp-content/database`; delete it to reset.
- PHPUnit uses the SQLite engine, not MySQL: avoid MySQL-only SQL in plugin code.

## Client IP and the rate limit

The newsletter and contact REST routes allow 5 requests per minute per visitor (429 after that). The count is atomic:
one `add_option()` creates the counter row, later requests run a single SQL `UPDATE ... option_value = option_value + 1`
and read the value back from the database (or `wp_cache_incr()` when a persistent object cache exists), so parallel
requests cannot slip past the limit. Counter rows are named `ita_rl_<form>_<md5 of IP>_<minute>` and rows of old minutes
are purged automatically; no IP is stored in plain text.

`ideatoapps_client_ip()` (plugin `includes/rest-guard.php`) uses **`REMOTE_ADDR` only**. `X-Forwarded-For` is
client-controlled and is never trusted by default. Behind a proxy or CDN (Cloudflare, Bluehost proxy cache) all visitors
share the proxy's address, so the site owner must map the real one with the `ideatoapps_client_ip` filter, only when
`REMOTE_ADDR` is one of their own proxies, and validate the header:

```php
add_filter( 'ideatoapps_client_ip', function ( $ip ) {
	$proxies = array( '203.0.113.10' ); // your proxy / CDN egress addresses.
	$fwd     = isset( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ? explode( ',', wp_unslash( $_SERVER['HTTP_X_FORWARDED_FOR'] ) ) : array();
	$client  = trim( (string) end( $fwd ) ); // the entry appended by YOUR proxy, not the first (spoofable) one.
	return in_array( $ip, $proxies, true ) && false !== filter_var( $client, FILTER_VALIDATE_IP ) ? $client : $ip;
} );
```

The result is validated again (`FILTER_VALIDATE_IP`); anything else becomes `0.0.0.0`.

## Cached pages and the REST nonce

Forms carry a nonce in the (possibly cached) HTML. When it has expired, the REST call answers 403
(`ideatoapps_bad_nonce`, or core's `rest_cookie_invalid_nonce` for signed-in visitors). `forms.js` then fetches a fresh
nonce from `GET /wp-json/ideatoapps/v1/nonce` (sent `no-store`) and retries the submission exactly once; if that also
fails it shows a fixed client-side message.

## Commerce tests (Task 8)

- PHP: `tests/php/EntitlementsTest.php`, `CommerceGateTest.php`, `CommerceFilesTest.php` (helpers in `CommerceTestCase.php`). They create
  real zip files in the throw-away uploads folder; `WPTestCase` deletes them after every test (the DB rolls back, the filesystem does not).
  Full-page renders of `single-app.php` can only happen once per PHP process (`get_header()` uses `require_once`): render parts instead.
- Browser: `tests/e2e/purchase.spec.ts` buys ClipForge with WooCommerce's offline Cash on delivery gateway (Stripe has no test keys here),
  with real accounts and real signed download links. It enables the gateway through the REST API and `resetContent()` removes its
  orders, customers and zips afterwards.
- The Playground dev server serves static files straight from disk and ignores `.htaccess`. The raw-zip 403/404 check in the browser
  test therefore also depends on the unguessable directory name; on Bluehost (Apache/LiteSpeed) `.htaccess` denies the whole
  `woocommerce_uploads` folder. See `docs/STRIPE_SETUP.md` for payments.
