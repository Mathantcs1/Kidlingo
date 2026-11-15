# IdeaToApps Website Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the ideatoapps.net WordPress storefront (custom theme + core plugin + WooCommerce) selling ClipForge as a one-time $24.99 zip download with a customer library, ready to hand to the owner for Bluehost deployment.

**Architecture:** A WordPress site on Bluehost shared hosting. A custom lightweight theme (`ideatoapps`) renders all pages. A small plugin (`ideatoapps-core`) adds an `app` post type (the no-code product registry) and a per-app *version* list. WooCommerce sells each app as a downloadable product; Stripe's hosted checkout takes payment; WooCommerce downloads serve the zips only to paid, logged-in customers. A separate packaging script builds the ClipForge zip (build + local launchers).

**Tech Stack:** WordPress 6.x, PHP (verify version in Task 1), WooCommerce, PHPUnit (WP test suite via wp-env), Playwright + axe-core for browser checks, Node/Vite for the ClipForge zip.

**Spec:** `docs/superpowers/specs/2026-11-15-ideatoapps-website-design.md` (source requirements: the owner's IdeaToApps Complete Single Claude Build Specification .docx, Part II overrides Part I hosting).

## Global Constraints

- Canonical origin `https://ideatoapps.net`; apex is canonical, `www` redirects to it.
- Hosting: Bluehost Business (shared): PHP + MySQL only. No Node/Docker at runtime. No new recurring hosting cost.
- ClipForge: one-time purchase, **$24.99 USD**, **no free trial**, never show "Free to try".
- Design tokens: `#0B1230` / `#111C46` dark, `#7357F5` violet, `#367CF5` blue, `#16B8B0` teal, `#D98A20` warning, `#F8FAFF` light bg, ink `#17203A`, muted `#61708D`; Inter (self-hosted), 16px body, 8px grid, 12px control radius, 16-20px card radius, motion 150-250ms and honours `prefers-reduced-motion`; breakpoints 360-767 / 768-1023 / 1024+.
- Accessibility target WCAG 2.2 AA; light and dark mode.
- No fabricated customer counts, testimonials, ratings, logos, prices or features. Only ClipForge README facts; roadmap items (audio editing, effects, animation) are never shown as features; "Chromium desktop tested, Safari untested".
- Tagline: "Useful apps. Brilliant ideas. One place."
- Stripe in **test mode** only; no live payments, DNS change, server deploy or purchase without explicit owner approval. Never store card data. No secrets committed; `.env.example` only.
- Contact form and mailbox addresses (support@, hello@) stay disabled until the owner confirms working mailboxes.
- Legal pages (privacy, terms, refund) are labelled DRAFT, pending legal review.
- Zip downloads are never in a public web path; served only to a logged-in customer with a paid order.
- ClipForge does NOT run from `file://` (verified): the zip must ship a local-server launcher and be built with `--base=./`.
- Files aim for ≤200 lines; follow WordPress coding standards (tabs in PHP, escape all output, sanitise all input, nonces on forms).

## Review Focus

1. Customer buys, then a **new ClipForge version is uploaded later**: past buyers must be able to download it (WooCommerce does not do this by default); a refunded or cancelled order must not.
2. Buyer has **neither Python nor Node** installed, or a launcher script is blocked by the OS: the launcher prints a clear instruction and the README names the manual steps.
3. Guessing or sharing a **direct zip URL**: an anonymous or non-buyer request returns 403/404, never the file.
4. **Empty states**: no published apps, no videos/YouTube URL, no posts: the section is hidden, never an empty box or broken link.
5. **Dark/light and 360px**: no horizontal overflow and AA contrast in both themes on every template.

---

## File Structure

```
site/
  package.json, playwright.config.ts, .wp-env.json, .env.example
  wp-content/plugins/ideatoapps-core/   ideatoapps-core.php, includes/{post-type,versions,entitlements,seo}.php
  wp-content/themes/ideatoapps/         style.css, theme.json, functions.php, header.php, footer.php, front-page.php,
                                        archive-app.php, single-app.php, page-*.php, parts/*.php, assets/{css,js,fonts}
  tests/php/*.php   tests/e2e/*.spec.ts
  docs/DEPLOYMENT_BLUEHOST.md, docs/ADMIN_GUIDE.md
scripts/package-clipforge.mjs           (ClipForge repo root: builds the buyer zip)
scripts/launchers/{start-windows.bat,start-mac.command,start-linux.sh,README-buyer.txt,LICENSE-buyer.txt}
tests/package-clipforge.test.ts         (Vitest, ClipForge side)
```

---

### Task 1: Local WordPress sandbox

**Files:** Create `site/package.json`, `site/.wp-env.json`, `site/.env.example`, `site/playwright.config.ts`, `site/docs/ENVIRONMENT.md`.

**Interfaces:** Produces: `npm run wp:start` (WordPress at `http://localhost:8888`), `npm run test:php`, `npm run test:e2e` scripts used by all later tasks.

- [ ] **Step 1:** Check what the sandbox can run: `php -v`, `docker --version`, `node -v`; try `npx @wp-playground/cli --version`. Record in `site/docs/ENVIRONMENT.md` which runner works (wp-env needs Docker; WordPress Playground needs only Node). Choose the one that works; if neither does, STOP and report to the owner.
- [ ] **Step 2:** Configure the chosen runner so it mounts the theme and plugin folders, installs WooCommerce, and starts at port 8888. Add PHPUnit via the runner's test container (or `wp-phpunit` + sqlite if on Playground).
- [ ] **Step 3: Failing test** `site/tests/e2e/smoke.spec.ts`: `GET /` returns 200 and the page title contains "IdeaToApps".
- [ ] **Step 4:** Run `npm run test:e2e` in `site/`. Expected: FAIL (theme not yet active).
- [ ] **Step 5:** Add a minimal `style.css` + `index.php` theme header "IdeaToApps" and activate it in the runner config. Run again. Expected: PASS.
- [ ] **Step 6:** Commit `chore(site): local WordPress sandbox and smoke test`.

### Task 2: ClipForge buyer zip

**Files:** Create `scripts/package-clipforge.mjs`, `scripts/launchers/*`, `tests/package-clipforge.test.ts`; Modify `package.json` (add `"package:zip": "node scripts/package-clipforge.mjs"`).

**Interfaces:** Produces: `node scripts/package-clipforge.mjs --version <semver> --out <dir>` writing `ClipForge-<version>.zip`; zip root contains `app/` (vite build with `--base=./`), `start-windows.bat`, `start-mac.command`, `start-linux.sh`, `README.txt`, `LICENSE.txt`, `VERSION`.

- [ ] **Step 1: Failing Vitest** `tests/package-clipforge.test.ts`: `buildZip({version:'1.0.0', out})` yields a zip listing exactly the entries above; `VERSION` contains `1.0.0`; `app/index.html` references assets with `./assets/` (no leading `/assets`); `start-mac.command` and `start-linux.sh` have the executable bit; rejects a non-semver version with an error.
- [ ] **Step 2:** Run `npx vitest run tests/package-clipforge.test.ts`. Expected: FAIL.
- [ ] **Step 3:** Implement `export async function buildZip(opts:{version:string; out:string}): Promise<string>` in `scripts/package-clipforge.mjs` (spawn `vite build --base=./ --outDir <tmp>`, copy launchers, zip with the `archiver` dev dependency, preserve file modes). Launchers: try `python3 -m http.server 8123 --directory app`, then `python`, then `npx --yes serve app -l 8123`; open `http://localhost:8123`; if none found print "Install Python 3 (python.org) or Node.js (nodejs.org), then run this again". `README-buyer.txt`: three-step run guide, manual one-liners, Chromium-desktop note, unsigned-script warning help for Windows/macOS, licence summary.
- [ ] **Step 4:** Run the test. Expected: PASS.
- [ ] **Step 5: Real run check** `site/tests/e2e/zip-runs.spec.ts`: unzip into a temp dir, run `start-linux.sh` with the browser-open step disabled via `CLIPFORGE_NO_OPEN=1`, load `http://localhost:8123` in Chromium, assert the "ClipForge" heading and "Import" button render and an OPFS write succeeds. Also assert a run with no Python/Node on PATH (empty PATH) prints the install message and exits non-zero.
- [ ] **Step 6:** Commit `feat: ClipForge buyer zip with local launchers`.

### Task 3: Core plugin: `app` post type and versions

**Files:** Create `site/wp-content/plugins/ideatoapps-core/ideatoapps-core.php`, `includes/post-type.php`, `includes/versions.php`; Test `site/tests/php/test-app-post-type.php`, `test-versions.php`.

**Interfaces:** Produces: post type `app` (public, slug `apps`, REST on). Meta (all `register_post_meta`, sanitised): `tagline`, `category` (taxonomy `app_category`), `platforms`, `price_label`, `launch_url`, `demo_url`, `video_id`, `faq` (JSON list of `{q,a}`), `features` (JSON list), `delivery_status` (`draft|coming_soon|live`), `woo_product_id` (int). Function `ideatoapps_get_versions(int $app_id): array` returning `[['version'=>string,'released'=>string,'changelog'=>string,'attachment_id'=>int], ...]` newest first; `ideatoapps_add_version(int $app_id, string $version, string $changelog, int $attachment_id): bool` (false on duplicate or non-semver version).

- [ ] **Step 1: Failing tests:** `test_app_post_type_registered`; `test_add_version_stores_and_orders_newest_first` (add 1.0.0 then 1.1.0, `get_versions[0]['version']==='1.1.0'`); `test_duplicate_version_rejected`; `test_non_semver_rejected` (`'abc'`, `'1.0'`); `test_meta_sanitised` (script tags stripped from `tagline`).
- [ ] **Step 2:** Run `npm run test:php`. Expected: FAIL.
- [ ] **Step 3:** Implement the post type, taxonomy, meta registration and the two functions; add an admin meta box "Versions" (add row: version, changelog, upload) and "Product details" boxes with nonces and capability checks (`edit_post`).
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5:** Commit `feat(core): app post type and version registry`.

### Task 4: Theme foundation and design system

**Files:** Create theme `style.css`, `theme.json`, `functions.php`, `header.php`, `footer.php`, `assets/css/tokens.css`, `assets/css/base.css`, `assets/js/theme-toggle.js`, `assets/js/nav.js`, `assets/fonts/` (Inter woff2), `parts/{button,card,section-heading}.php`; Test `site/tests/e2e/shell.spec.ts`.

**Interfaces:** Produces: CSS custom properties from Global Constraints (`--bg`, `--ink`, `--muted`, `--primary`, `--accent`, `--card`, `--radius-ctl`, `--radius-card`), `[data-theme=light|dark]` switch persisted in `localStorage` (try/catch) and defaulting to `prefers-color-scheme`; template part helper `ideatoapps_part(string $name, array $args=[]): void`.

- [ ] **Step 1: Failing e2e** `shell.spec.ts`: header has links Apps, Learn, Blog, About and a theme toggle; toggling sets `html[data-theme]` and survives reload; at 360px the nav collapses into a drawer opened by a labelled button and closed with Escape; skip-link is first focusable; no horizontal overflow at 360/390/768/1024/1440; axe reports zero serious/critical violations in both themes.
- [ ] **Step 2:** Run it. Expected: FAIL.
- [ ] **Step 3:** Implement tokens, base styles, header/footer (footer lists Apps, Learn, Blog, About, Contact, Privacy, Terms, Refund), toggle and drawer. Self-host Inter; no external font requests.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(theme): design system, header, footer, dark/light`.

### Task 5: Home page

**Files:** Create `front-page.php`, `parts/hero.php`, `parts/featured-apps.php`, `parts/how-it-works.php`, `parts/watch-learn.php`, `parts/newsletter.php`; Test `tests/e2e/home.spec.ts`.

**Interfaces:** Consumes: `app` CPT, `ideatoapps_part`. Produces: option `ideatoapps_youtube_channel_url`, `ideatoapps_featured_app_ids`.

- [ ] **Step 1: Failing e2e:** hero shows the tagline and buttons "Explore apps" (→ `/apps/`) and, only when a video exists, "Watch demos"; featured section lists the ClipForge card with "$24.99 one-time" and no "Free"; with zero published apps the featured section is absent (not empty); with no YouTube URL the Watch & Learn section is absent; page has exactly one `h1`.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement the sections; each part returns early when it has no content. Add a page-level fixture in the e2e setup that publishes ClipForge and, in a second test, trashes it.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(theme): home page`.

### Task 6: Apps catalog and app detail (ClipForge listing)

**Files:** Create `archive-app.php`, `single-app.php`, `parts/app-card.php`, `assets/js/catalog.js`, `includes/seed-clipforge.php` (plugin), `tests/e2e/catalog.spec.ts`, `tests/e2e/app-detail.spec.ts`.

**Interfaces:** Consumes: Task 3 meta. Produces: URL-synced filters `?s=&category=&sort=` on `/apps/`; `wp ideatoapps seed-clipforge` WP-CLI command creating the ClipForge app (idempotent).

- [ ] **Step 1: Failing e2e:** `/apps/` filters by search and category with the URL updating and back button working; zero results shows an empty state with a "Clear filters" button; the ClipForge page shows the "Buy ClipForge, $24.99 one-time" button, the README-sourced feature list (import video/audio/images; trim/split/ripple delete; layered timeline with picture-in-picture; formats 16:9, 9:16, 1:1, 4:5; MP4 export 1080p or 4K; works locally so media never leaves the device), a requirements note "Chromium-based desktop browser (Safari untested); Python 3 or Node.js needed to run the local launcher", and **does not contain** the words "Free to try", "audio editing", "effects", "animation" or any rating/customer count. A `coming_soon` app shows "Coming soon" and no buy button.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement templates, filter JS (progressive enhancement: works with plain GET without JS), seed command, `SoftwareApplication` JSON-LD hook point (filled in Task 10).
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: apps catalog and ClipForge listing`.

### Task 7: Content pages (Learn, Blog, About, Contact, FAQ, legal, newsletter)

**Files:** Create `page-learn.php`, `page-contact.php`, `page-about.php`, `page-faq.php`, `index.php`/`single.php` for blog, `parts/video-card.php`, plugin `includes/newsletter.php`, `includes/contact.php`, `includes/video.php`; Test `tests/e2e/content.spec.ts`, `tests/php/test-contact.php`, `test-newsletter.php`.

**Interfaces:** Produces: CPT `video` (meta `youtube_id`, `related_app_id`); REST `POST /wp-json/ideatoapps/v1/newsletter {email, consent}`; `POST /wp-json/ideatoapps/v1/contact {name,email,message,website}` (`website` is a honeypot); option `ideatoapps_contact_enabled` (default false).

- [ ] **Step 1: Failing tests:** newsletter rejects missing `consent`, invalid email, and a 6th request in a minute from one IP (429); stores `consent_at`; contact returns 503 "not yet available" while disabled, 400 when the honeypot is filled, and sends mail only when enabled; Learn page loads the YouTube player only after a click (no iframe in initial HTML; privacy-enhanced `youtube-nocookie.com`); Learn hidden from nav when no videos; legal pages carry a visible "DRAFT, pending legal review" banner; blog shows an empty state with no posts.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement endpoints (nonce/rate limit via transients, `sanitize_email`, `wp_mail`), video CPT, templates, legal placeholders from short draft text.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: learn, blog, contact, newsletter and legal pages`.

### Task 8: Commerce, accounts and protected downloads

**Files:** Create plugin `includes/entitlements.php`, theme `woocommerce/` overrides for `myaccount/downloads.php` and `checkout`, `tests/php/test-entitlements.php`, `tests/e2e/purchase.spec.ts`; Create `site/docs/STRIPE_SETUP.md`.

**Interfaces:** Consumes: `ideatoapps_get_versions`, `woo_product_id`. Produces: `ideatoapps_sync_product_downloads(int $app_id): void` (rebuilds the Woo product's downloadable files from versions, one file per version named "ClipForge <version>"); `ideatoapps_grant_new_version(int $app_id, string $version): int` (grants download permission for the new file to every order of that product whose status is `completed` or `processing`; returns count; skips refunded/cancelled/failed); account creation required at checkout (guest checkout off); downloads stored under `wp-content/uploads/woocommerce_uploads/` (protected) and served via WooCommerce signed download links.

- [ ] **Step 1: Failing PHP tests:** `test_buyer_receives_all_current_versions_on_completed_order`; `test_new_version_granted_to_past_completed_buyer`; `test_refunded_order_not_granted_new_version`; `test_second_run_is_idempotent` (granting twice does not duplicate); `test_price_is_2499_usd_and_not_editable_from_request` (checkout cart amount comes from the product, 24.99).
- [ ] **Step 2:** Run `npm run test:php`. Expected: FAIL.
- [ ] **Step 3:** Implement sync + grant functions, hooked on version added; force guest checkout off; configure the Woo product via the seed command (virtual, downloadable, $24.99, USD, no limit, no expiry); show a themed "My library" (`/my-account/downloads/`) listing each version with changelog and a download button, and an empty state "No purchases yet".
- [ ] **Step 4:** Run tests. Expected: PASS.
- [ ] **Step 5: E2E** `purchase.spec.ts` using Stripe **test mode** or WooCommerce's offline/COD gateway as a stand-in when Stripe keys are absent: register, buy ClipForge, see 1.0.0 in the library and download a zip whose first bytes are `PK`; an anonymous `GET` of the raw zip path returns 403 or 404; a second user cannot fetch the first user's download link; uploading 1.1.0 later makes it appear for the first buyer without any action. Document in `STRIPE_SETUP.md` the exact plugin, keys (placeholders), webhook URL `https://ideatoapps.net/?wc-api=wc_stripe`, and test cards; webhook replay must not create a second order.
- [ ] **Step 6:** Commit `feat(commerce): one-time ClipForge purchase, library and versioned downloads`.

### Task 9: SEO, performance and accessibility hardening

**Files:** Create plugin `includes/seo.php`, theme `robots`/headers helpers, `tests/e2e/seo.spec.ts`, `tests/e2e/a11y.spec.ts`.

**Interfaces:** Produces: `ideatoapps_app_jsonld(int $app_id): array` (SoftwareApplication with `Offer` price `24.99`, `priceCurrency` USD, only fields that exist; no `aggregateRating`).

- [ ] **Step 1: Failing tests:** unit test that the JSON-LD has the offer price and no `aggregateRating`/`review`; e2e that every public page has one canonical link on `https://ideatoapps.net/...`, unique `<title>`, meta description, Open Graph tags, `robots.txt` references the sitemap, `sitemap.xml` lists `/apps/clipforge/`, `/my-account/` and `/wp-admin/` are `noindex`; axe zero serious/critical on home, apps, app detail, learn, contact, login, library in both themes at 360 and 1440; Lighthouse-style budget: home HTML + CSS + JS under 250 kB transferred, images lazy-loaded with width/height set.
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement SEO output (own minimal implementation or vetted SEO plugin config, decided here and recorded), caching headers, security headers (`X-Content-Type-Options`, `Referrer-Policy`, frame protection) via `.htaccess` snippet documented for Bluehost.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat: seo, structured data, accessibility and performance hardening`.

### Task 10: Documentation, packaging and handoff

**Files:** Create `site/docs/DEPLOYMENT_BLUEHOST.md`, `site/docs/ADMIN_GUIDE.md`, `site/docs/DECISIONS.md`, `site/scripts/package-site.mjs`, `site/tests/package-site.test.ts`.

**Interfaces:** Produces: `node site/scripts/package-site.mjs` writing `dist-site/ideatoapps-theme.zip` and `ideatoapps-core.zip`.

- [ ] **Step 1: Failing test:** zips contain the expected top-level folders and `style.css` theme header; no `.env`, `node_modules`, tests or secrets in them (scan for `sk_live`, `sk_test`, `whsec_`).
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement packaging. Write `DEPLOYMENT_BLUEHOST.md` (create the WordPress site via Add Website → WordPress or Empty Environment, install the two zips, install WooCommerce + the chosen Stripe plugin, force HTTPS and apex redirect in `.htaccess`, DNS/SSL checks, UpdraftPlus-style backup and a restore test, rollback, SPF/DKIM/DMARC when mailboxes exist, a launch checklist, and "what I verified vs. what only you can verify"). Write `ADMIN_GUIDE.md` for a non-developer: publish an app, change the price, add a video, upload a new ClipForge version (and how past buyers get it), handle a refund, handle an order. `DECISIONS.md` records plugin choices and costs (Stripe fees, any paid extensions) with unknowns marked.
- [ ] **Step 4:** Run the whole gate: `npm run test:php && npm run test:e2e && npx vitest run && npm run typecheck` in the relevant folders. Expected: all PASS.
- [ ] **Step 5:** Capture desktop (1440) and mobile (390) screenshots of home, apps, ClipForge page, library and admin version upload into `site/docs/screenshots/`.
- [ ] **Step 6:** Commit `docs: bluehost deployment, admin guide, packaging`.

---

## Self-Review

- **Spec coverage:** goals (no-code product adds → T3/T6; one-time $24.99 + login + versioned downloads → T2/T8; Learn/blog/newsletter/contact → T7; SEO/a11y/perf → T9; docs + Bluehost deploy → T10; dark/light + responsive → T4). Non-goals (subscriptions, Node runtime, free trial) have no task. Anti-goals enforced by tests in T5/T6/T9.
- **Open items from the spec:** contact email, YouTube URL, logo, refund terms and tax handling are handled by the disabled/hidden states in T5/T7 and recorded in `DECISIONS.md` (T10); they do not block the build.
- **Type consistency:** `ideatoapps_get_versions`, `ideatoapps_add_version`, `woo_product_id`, `ideatoapps_sync_product_downloads`, `ideatoapps_grant_new_version` are defined in T3/T8 and used consistently.
- **Proportion:** each task names signatures, tests and values; no function bodies.
- **Not in this plan (needs the owner):** live deployment, DNS, Stripe live keys, real legal text, mailbox setup.
