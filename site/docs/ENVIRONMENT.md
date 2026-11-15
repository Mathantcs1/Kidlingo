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
