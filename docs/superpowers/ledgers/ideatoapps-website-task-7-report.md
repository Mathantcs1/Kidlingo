# Task 7 report: Learn, Blog, About, Contact, FAQ, legal pages, newsletter

## What was built
Plugin (ideatoapps-core, version 0.1.1 -> 0.2.0 so rewrites flush and pages are seeded):
- includes/rest-guard.php: client IP (REMOTE_ADDR only, `ideatoapps_client_ip` filter for proxies), 5/min/IP transient limiter (hashed IP key), X-WP-Nonce (`wp_rest`) permission check, 429 helper.
- includes/newsletter.php: POST /ideatoapps/v1/newsletter {email, consent}: nonce 403, rate limit 429, bad email/missing consent 400, stores a private non-public `ita_subscriber` post (email + `consent_at` ISO time), duplicate email stored once with an identical answer (no probing). Copy never says mail is sent. `ideatoapps_newsletter_available` is turned on by the plugin only while its own route action exists.
- includes/newsletter-export.php: Tools > Newsletter list, nonce + manage_options CSV download (formula-injection neutralised).
- includes/contact.php: POST /ideatoapps/v1/contact; option `ideatoapps_contact_enabled` (default false, checkbox in Settings > IdeaToApps). Order: 503 "not yet available" while disabled, 403 nonce, 400 filled honeypot `website`, 429, validation 400, wp_mail to the WordPress admin email (Reply-To carries only the validated address). No address is printed anywhere.
- includes/video-meta-box.php: "Video details" box (YouTube link or ID, accepts watch/youtu.be/embed/shorts URLs, related app), nonce + cap, notice on a bad link. includes/video.php itself unchanged (meta was already registered there).
- includes/pages.php: creates empty shell pages about, contact, faq, blog, privacy, terms, refund-policy once (remembered in an option, so a page the owner trashes is not resurrected); run on activation and on the version-bump init hook.
Theme: archive-video.php (/learn/), single-video.php, page.php (generic + legal), page-about/contact/faq/blog.php, single.php, index.php (cards + empty state), parts video-frame/video-card/post-list/contact-form/draft-banner/legal-{privacy,terms,refund-policy}, newsletter part (consent checkbox, nonce), inc/content.php, content.css, forms.js (newsletter + contact, JSON + X-WP-Nonce, status line role=status), video-player.js (click-to-load youtube-nocookie iframe, ID validated, focus moved to iframe).
Learn link: `ideatoapps_learn_link()` adds it to the header AND footer only while a published video exists.

## RED / GREEN
RED (PHPUnit, before any implementation): `php vendor/bin/phpunit tests/php/NewsletterTest.php` -> 2 errors, 8 failures (no route/CPT/functions); `ContentPagesTest.php` -> 5 errors, 4 failures (undefined `ideatoapps_extract_youtube_id`, `ideatoapps_ensure_pages`, `video-card` part, version still 0.1.1).
GREEN: `php vendor/bin/phpunit` -> OK (132 tests, 602 assertions).
Playwright: content.spec.ts was written after the templates (not strictly red first; honest note). Its first run found a real fixture gap (REST cannot write video meta: the type lacks custom-fields support, so the helper now saves through the real "Video details" form, which also exercises the meta box) and a strict-locator bug. Screenshots then exposed unstyled breadcrumb, FAQ, newsletter card and spacing on non-home pages (CSS lived in home.css/app.css/catalog.css); moved to components.css.
Final: full `npx playwright test` -> 223 passed, 4 skipped (screenshot specs, need SCREENSHOTS=1), 29.3 min, exit 0. content.spec.ts is 61 tests (Learn/Blog/About/FAQ/legal/Contact/Newsletter behaviour plus 52 axe + 360px/desktop overflow checks in both themes over 13 template states).

## Mutation checks (each reverted; each made a test fail)
no-consent check removed; rate limit off by one; contact "enabled" guard removed; honeypot ignored; iframe in initial video HTML; Learn link always shown; CSV formula not neutralised.

## Changes to Task 4-6 tests (called out)
- shell.spec.ts footer: Learn is now hidden without videos (7 links) instead of always present; ThemePartsTest likewise.
- home.spec.ts: newsletter is now present by default (the "absent by default" test became "present with consent checkbox"); section lists now end with `newsletter`.
- HomeDataTest newsletter test removes the plugin filter to simulate "no route".

## Scope additions / deviations (called out)
- Brief lists page-learn.php; /learn/ is the video CPT archive, so it is archive-video.php (a Page with slug learn would clash). Blog is a Page (slug blog, page-blog.php with `?pg=` pagination) rather than page_for_posts, because page_for_posts without a static front page would break front-page.php.
- New: includes/video-meta-box.php (brief said extend video.php), rest-guard.php, newsletter-export.php, pages.php, Tools export screen, contact option checkbox, CPT `ita_subscriber` (name must be <= 20 chars: a 21-char name silently failed to insert).
- CSS moved to components.css: empty-state, pagination, breadcrumb, faq, newsletter, section-actions, section--flush-top (needed by non-home pages).
- Footer Learn link hidden without videos (brief said "nav link").
- Added WPTestCase::make_user, helpers createPost, createVideo (via form), saveSettings({contact}), resetContent deletes posts.

## Self-review / concerns
- Nonce is in the page HTML: a full-page cache older than 12-24 h makes submissions 403 until refreshed (message says reload). Needs a cache-aware plan on Bluehost if page caching is enabled.
- Rate limit trusts REMOTE_ADDR only; behind Cloudflare/proxy all visitors may share one IP (map via `ideatoapps_client_ip`). Transients on shared hosting without object cache live in wp_options.
- Subscriber dedupe has a small concurrency race (two simultaneous identical sign-ups could both store). No unsubscribe/erasure UI (WP personal-data eraser not wired); owner removes manually.
- wp_mail on shared hosting may be unreliable; contact stays off until the owner turns it on after confirming a mailbox. Real mail delivery was not exercised (stubbed in PHPUnit; e2e mocks the success response).
- Legal text is deliberately thin: all facts the owner must supply are "Owner to confirm" marks; the DRAFT banner is code-controlled for the three slugs (remove it in a later task once reviewed). If the owner edits legal page content in WordPress, that replaces the default text but the banner stays.
- Video play without JavaScript does nothing (no no-JS fallback link); posters only from the featured image (no YouTube thumbnails, to avoid third-party requests).
- The 429 path is covered by PHPUnit and by a mocked-response e2e (real 6-request e2e would poison the shared per-minute limit for other specs).
- Real Gutenberg save of the video meta box was not exercised in a browser (fixture posts the classic form).
- Screenshots: site/docs/screenshots/task-7/ (dark/light x 1440/360), viewed; regenerate with `SCREENSHOTS=1 npx playwright test tests/e2e/screenshots-task7.spec.ts`.
