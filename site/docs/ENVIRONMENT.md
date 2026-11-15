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
are purged automatically; the IP is stored only as an MD5 hash, which is weak for IPv4 (only about four billion possible addresses, so a hash can be reversed by guessing) and is therefore still personal data; rows are kept for about a minute and are cleaned up when the next counter is created, so on a quiet site a few can linger.

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

## Launch checklist items from Task 8

- The raw release zip URL must return 403 in a private window on the real host (Apache `.htaccess`; nginx ignores it, so add a server rule there).
- Real Stripe test-mode checkout and a webhook replay (the browser tests use Cash on delivery).
- Run the order lookup (downloads/library queries) once on MySQL; PHPUnit and the dev server use SQLite.
- Checkout drops the billing address and phone fields; revisit if tax-by-postcode or Stripe Radar is wanted.
- Cart and checkout pages are converted to the classic shortcodes once per plugin version: the owner reloads a page or runs the seed to trigger it.
- `delete_attachment` leaves a stale product file entry; the buy gate (`ideatoapps_app_is_sellable`) catches it, so the app just stops being sellable.
- Version zips are moved to `woocommerce_uploads/ideatoapps/` on add/update even when no product is linked yet, but only while WooCommerce is active.
- **Every** `.zip` uploaded to the media library becomes private and is moved into the protected folder while WooCommerce is active (the hook cannot tell a release zip from any other zip). Public zips (blog downloads etc.) must be hosted elsewhere.
- Only users with `read_private_posts` (Editors, Administrators) see a protected zip again in the Versions picker; use the Versions box as Administrator or Editor. Authors are not blocked in code (restricting the box was judged riskier than documenting it).
- Origin check of the nonce route (`ideatoapps_rest_is_first_party()`): compares scheme, host and port against `home_url()` (default ports normalised, case and one trailing dot ignored). Behind a TLS-terminating proxy that makes `home_url()` and the browser origin differ in scheme, the form nonce is anonymous-only for signed-in visitors.
- A version's file can only be set by an admin (`manage_options`) or by the user who uploaded it (review M-1).

## SEO, structured data and performance (Task 9)

- Plugin files: `includes/seo.php` (canonical origin, `ideatoapps_app_jsonld()`, recursive rating/review stripper), `seo-site-schema.php`
  (Organization + WebSite on the home page), `seo-noindex.php`, `seo-text.php` (titles and descriptions), `seo-head.php`
  (canonical, description, Open Graph), `seo-robots.php` (robots.txt, `/sitemap.xml` rewrite, sitemap filters), `seo-headers.php`.
- No SEO plugin is installed, so these ship in the plugin. They switch off when Yoast, Rank Math, AIOSEO, SEOPress or The SEO Framework is
  active (or when the `ideatoapps_seo_enabled` filter returns false), so one can take over later. The app JSON-LD offer stays (it knows the product).
- Canonical links, `og:url`, JSON-LD page URLs and the `Sitemap:` line use the constant `IDEATOAPPS_CANONICAL_ORIGIN` (`https://ideatoapps.net`),
  never the request host. The filter `ideatoapps_canonical_origin_local_testing_only` exists only so a local run could point at another origin;
  no test uses it. Core's sitemap lists real URLs from the site address, so on production (address = apex) they match.
- Noindex (`noindex, follow`, no canonical): my-account, cart, checkout, shop and product pages, search, 404, author/date/category/tag/taxonomy
  archives, empty apps/Learn archives, Blog with no posts, Contact while the form is off. The WordPress login page is noindex through core.
- `/sitemap.xml` is a rewrite to core's sitemap (the canonical-redirect then answers 301 to `/wp-sitemap.xml`); the rule needs the rewrite flush that
  the plugin version bump (0.4.0) triggers. Owner todo: trash the default "Sample Page" (WordPress adds it; it would be listed).
- Browser UI colour: two `theme-color` meta tags (dark `#0B1230`, light `#F8FAFF`) selected by the OS colour scheme. The page's theme toggle cannot change them.
- Payload budget (`tests/e2e/seo-perf.spec.ts`): HTML + CSS + JS of the home page under 250 kB, measured on the raw (decoded) bodies because the
  Playground dev server does not compress; a gzip estimate is printed with it. Real transfer size on Bluehost is unverified.
- Accessibility: `tests/e2e/a11y.spec.ts` (axe, both themes, 360 and 1440). Server headers: see `HTACCESS_SNIPPET.md`.

## Checks added in Task 10

- **Script errors on cart and checkout (review I1).** The theme defers jQuery for speed, and WooCommerce's cart and checkout scripts need it.
  `tests/e2e/script-errors.spec.ts` loads `/cart/` and `/checkout/` with ClipForge in the cart and fails on any page error
  (including `jQuery is not defined` / `ReferenceError`) or when `window.jQuery` is not a function. It was mutation-checked by removing the
  jQuery script tag. It runs against the Playground dev server only; load order on Bluehost with a caching or "optimise JavaScript" plugin
  is unverified, so open `/cart/` and `/checkout/` with the browser console open once after launch and after installing any optimisation plugin.
- **Fail-closed JSON-LD seam (review I2).** The branch of the single-app seam in `seo.php` that returns no structured data when the data
  fails validation is **verified by reading the code, not by a test** (nothing in the suite can make that branch run). The rating/review stripping
  and the offer rules are tested (`tests/php`, `seo-schema.spec.ts`).
- **robots.txt `Disallow` versus `noindex` (review M1).** `/my-account/`, `/cart/` and `/checkout/` have both on purpose. `Disallow` in
  `robots.txt` keeps crawlers from fetching private, per-visitor pages at all. `noindex, follow` in the page head is the stronger, per-page signal
  that keeps a page out of search results, but a crawler only sees it if it may fetch the page. Search engines can occasionally list a
  disallowed URL (address only, no text) when other sites link to it; for account, cart and checkout pages that is harmless and rare. Pages that
  must be fetched to see their `noindex` (`/shop/`, `/product/clipforge/`, search, archives) are therefore **not** disallowed. If a disallowed
  URL ever shows up in search results, remove its `Disallow` line for a few weeks so the crawler can read the `noindex`, then restore it.
  Decision: keep as is.
- **Packaging.** `npm run site:package` (repo root) writes `dist-site/ideatoapps-theme.zip` and `dist-site/ideatoapps-core.zip`
  (git-ignored). It leaves out dotfiles, `node_modules`, tests, docs and screenshots, and fails (writing nothing) if any file that would ship
  contains a Stripe key prefix, `whsec_`, an AWS/GitHub/Slack/Google key or a private key block. Test: `site/tests/package-site.test.ts`
  (picked up by the root `npx vitest run`).
- **Screenshots.** `SCREENSHOTS=1 npx playwright test tests/e2e/screenshots-task10.spec.ts` regenerates `docs/screenshots/task-10/`
  (home, apps, ClipForge page and library; 1440 and 390 px; the admin Versions box could not be captured, see the Task 10 report; dark and light for public pages).
