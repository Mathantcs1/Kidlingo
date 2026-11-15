# SDD ledger — plan: /home/user/Kidlingo/docs/superpowers/plans/2026-11-15-ideatoapps-website.md

Spec: docs/superpowers/specs/2026-11-15-ideatoapps-website-design.md (reachable, committed 1d2cb5f).
Workspace: no separate worktree; executing on the session's dedicated branch claude/ideatoapps-website-design-iqhhrv (not main).
Rule: commits are LOCAL ONLY. Pushing is blocked/needs the user's explicit "commit and push"; never push, never deploy.
Rule: every commit ends with the two trailer lines (Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com> / Claude-Session: https://claude.ai/code/session_01AdHhRpWBrbnaseTnY78bTT).
Rule: ClipForge repo CLAUDE.md applies to files under /home/user/Kidlingo/{src,scripts,tests} (run `npm test && npm run typecheck && npm run build` when touching ClipForge code; keep data-testids).

## Pre-flight scan
| Pair / task | Produces vs consumes | Finding | Ruling |
|---|---|---|---|
| T1 -> all | npm scripts wp:start/test:php/test:e2e | none | - |
| T2 own text | package.json gets `archiver` devDep; test file in ClipForge tests/, e2e in site/tests | T2 step 5 needs T1 playwright (ok, T1 first) | adds a dev dependency to ClipForge package.json; accepted, must run full ClipForge gate |
| T3 -> T6/T8 | meta woo_product_id, versions fns | none | - |
| T4 vs T7 | T4 e2e asserts a "Learn" nav link; T7 hides Learn when no videos | CONFLICT | Ruling: T4 asserts Apps, Blog, About + toggle only; Learn link is conditional on >=1 published video (tested in T7) — spec says hide empty modules — if wrong: one nav test edit |
| T5 vs T7 | T5 needs `video` CPT (Watch & Learn, "Watch demos") but T7 creates it | CONFLICT | Ruling: T5 creates plugin `includes/video.php` registering CPT `video` (meta youtube_id, related_app_id); T7 consumes it and does not recreate — if wrong: move one file |
| T6 vs T8 | T6 Buy button needs a Woo product; T8 owns commerce | CONFLICT (dead button) | Ruling: `seed-clipforge` (T6) also creates the Woo product ($24.99 USD, virtual, downloadable) and sets woo_product_id; button links to ?add-to-cart=<id>, rendered only when woo_product_id set. T8 extends the same seed idempotently (guest checkout off, downloads) — if wrong: small seed edit |
| T9 own text | test expects /sitemap.xml but core WP serves /wp-sitemap.xml | CONFLICT | Ruling: use core /wp-sitemap.xml, add rewrite /sitemap.xml -> /wp-sitemap.xml, robots.txt references /sitemap.xml — if wrong: one redirect |
| T8 own text | Stripe e2e needs keys; fallback offline gateway | none | fallback stands; Stripe stays test-mode-only |
| T10 own text | gate runs typecheck in "relevant folders" | vague | Ruling: ClipForge root `npm test && npm run typecheck && npm run build`, plus site test commands |
| T7 -> T5 | newsletter section form on home posts to T7 endpoint | T5 form must work or be hidden | Ruling: T5 renders the newsletter part only if the REST route exists (post-T7); T5 tests it absent/hidden pre-T7, T7 re-enables with a test |

## Progress
BASE_T1=1d2cb5f2e4f807e359c344af4d7c1823974fb556
Task 1: implementer DONE_WITH_CONCERNS (commit 9aec72f); concern: test:php is plain PHPUnit, does not boot WordPress (needed by T3/T8); review dispatched (agent a5a7fbfcf088e8c4a)
Task 1: review = Needs fixes. Important: test:php does not boot WordPress/WooCommerce (bootstrap.php, composer.json, ENVIRONMENT.md:35-36) -> fix round 1.
Task 1: minor (deferred): wp-bootstrap.mjs WooCommerce zip not checksum-verified, WP core version floats (^7.1)
Task 1: minor (deferred): bootstrap failure surfaces only as a 300s Playwright timeout
Task 1: minor (deferred): smoke test cannot distinguish theme from blueprint blogname; add theme body-class/path assertion
Task 1: minor (deferred): stale-title intermittency on persisted DB unexplained; consider `npm run wp:reset`
Task 1: minor (deferred): .gitignore line for composer.lock.bak
FIXBASE_T1=9aec72fc5d7ef407a658ba1a02182de292475bdb
Task 1: fix round 1/5 submitted (commit da94285), re-review pending
Task 1: fix round 1/5 (1 addressed, 0 open; commits 9aec72f..da94285)
Task 1: minor (deferred): ENVIRONMENT.md:31 stale "WordPress not loaded" line; test:php needs `npm install` for @wp-playground/cli (hidden prerequisite, document); env.php glob('{,.}*') returns . and ..
Task 1: complete (commits 1d2cb5f..da94285, review clean)
BASE_T2=da942853dc5b10bb697b4939b75a8f88ca24b9ee
Task 2: implementer DONE_WITH_CONCERNS (commit bc6be6c). Concerns are correctness-level -> addressed BEFORE review:
Task 2: Ruling: stock `python -m http.server` can serve .js as text/plain on Windows (registry MIME map) which blocks ES module scripts, and `npx --yes serve` needs internet (contradicts run-locally). Ship zero-dependency `serve.py` and `serve.mjs` in the zip with an explicit MIME map (.js .mjs .css .html .json .svg .wasm .png .jpg .woff2 .txt), SPA fallback to index.html, bind 127.0.0.1 only; launchers prefer python3 -> python -> node. — cost if wrong: small launcher/server rewrite
Task 2: minor (deferred): Windows .bat / macOS .command untested on real OS (Linux only) — verify on real machines before launch; add to DEPLOYMENT/launch checklist
Task 2: pre-review fix done (f5c554d); concerns noted: RED shown by removal not tests-first; build lock added in package-clipforge.mjs; .wasm test uses a probe file; review dispatched
Task 2: review = Needs fixes. Important x3: (1) traversal test partly vacuous (clipforge-servers.test.ts:1771-1777, no canary outside app/, guards not mutation-checked); (2) start-windows.bat closes window on server failure (no pause); (3) browser opens after failed start in all launchers -> fix round 1.
Task 2: minor (deferred): build lock has no heartbeat (120s stale), global tmpdir, two waiters can both steal; Windows allow_reuse_address may allow silent double-bind; invalid CLIPFORGE_PORT traceback in serve.py vs silent fallback in serve.mjs; bind test reads /proc/net/tcp (Linux-only); spaces-in-path launcher untested; waitForServer could accept a foreign server on 8123; README references app/licenses/THIRD-PARTY.txt without a zip test; LICENSE says "tested in desktop Chrome only" (CLAUDE.md: headless Chromium only, soften to "tested in Chromium"); .wasm probe file; "IdeaToApps" as publisher in LICENSE to confirm with owner
FIXBASE_T2=f5c554d
Task 2: fix round 1/5 submitted (commit 5294577); re-review pending
Task 2: fix round 1/5 (3 addressed, 0 open; commits f5c554d..5294577)
Task 2: minor (deferred): serve.mjs:36 --check has no real timeout (only a timeout event); start-windows.bat `if errorlevel 1` shows the "could not start" message after Ctrl+C (unix launchers exclude >=128); second launch while ClipForge runs opens the existing instance (benign); watcher gives up after ~5-7s on slow machines
Task 2: complete (commits da94285..5294577, review clean)
BASE_T3=5294577cd3f43d1dcd62fbfb474511dff7604100
Task 3: implementer DONE_WITH_CONCERNS (commit 8017ae7); concerns: plain attachment-ID input, versions add-only in UI, faq/features as raw JSON textareas, PHPCS not run; review dispatched
Task 3: review = Needs fixes. Critical: double wp_unslash corrupts faq/features JSON and changelog backslashes (meta-boxes.php:408, versions.php:723). Important: raw-JSON textareas + silent wipe to [] (meta-boxes.php:365-372, meta.php:515-518); versions add-only (meta-boxes.php:419-460); silent failure on invalid/duplicate version (meta-boxes.php:452-458); no rewrite flush on activation -> fix round 1. (Reviewer reported the brief path as unreadable (typo on its side); it judged against the controller decisions in the dispatch, which restate the brief.)
Task 3: Ruling: also put a small wp.media file picker in scope for round 1 (reviewer rated Minor) — the spec's definition of done needs a non-technical owner to upload a ClipForge zip; typing an attachment ID is not workable and the version-edit fix is hollow without it — cost if wrong: ~40 lines JS
Task 3: minor (deferred): attachment_id not validated as an attachment (versions.php:721) and woo_product_id editable by anyone with edit_post -> CARRY INTO TASK 8 dispatch (treat as untrusted; restrict/validate when gating downloads); absint(-5)=5; weak XSS assertion (AppMetaBoxTest.php:104,113); missing autosave/revision/non-app/REST-write tests; read-modify-write race on versions meta (note in code); PHPCS not run; delivery-status dropdown shows raw coming_soon
FIXBASE_T3=8017ae7
Task 3: fix round 1/5 submitted (dd91d6b); concern: admin JS (FAQ rows, wp.media picker) not browser-tested -> consider Playwright admin test; re-review pending
Task 3: fix round 1/5 (5 addressed + ruling, 0 open; commits 8017ae7..dd91d6b)
Task 3: minor (deferred): last FAQ row cannot be deleted (no ita_faq_q[] posted -> old FAQ kept; meta-boxes.php:112, admin-app.js:335-339; fix with hidden sentinel/nonce check); REST write of invalid JSON dropped silently + stray admin notice; sanitize_text_field strips %xx octets in feature/FAQ text; FAQ row with empty q but non-empty a stored; admin JS (FAQ rows, wp.media picker) never run in a browser -> add Playwright admin test (T10 or earlier)
Task 3: CARRY INTO TASK 8: ideatoapps_remove_version has no purchase check (T8 must look up versions/attachments by version string and tolerate a missing version); attachment_id and woo_product_id are untrusted (validate attachment post type; restrict woo_product_id to manage_options)
Task 3: complete (commits 5294577..dd91d6b, review clean)
BASE_T4=dd91d6b4334081a4e85b04d8bea7c10f861a9400
Task 4: implementer DONE (bd50c2a); minor concerns: links 404 until later tasks, placeholder front-page, light-mode darker link shades than spec for contrast, no-JS gets dark theme + plain list; review dispatched
Task 4: review = Approved by reviewer but with 2 Important findings (the loop triggers on any Important): (1) .btn--primary:hover #8268FF with white text ~3.9:1 fails AA in dark mode (components.css:22), axe never hovers; (2) axe "incomplete" color-contrast results on gradient text (hero glow, gradient wordmark "To", layout.css:14) are ignored because tests filter only `violations` -> fix round 1.
Task 4: minor (deferred): overflow test runs only on near-empty pages (re-use helper on later pages); no axe run with drawer open at 360 / focus / hover states; ideatoapps_is_current_path breaks in subdirectory installs and current state is colour-only (WCAG 1.4.1); nav.js:46 resize drops focus to body; no-JS drawer keeps role=dialog aria-modal, no-JS toggle inert, no-JS always dark (add prefers-color-scheme fallback guarded by :root:not([data-theme])); drawer lacks wordmark + theme toggle; Sign in ignores login state, add_theme_support('woocommerce') anticipatory; card hover translateY under reduced motion; hero lead wraps "write-/ups."; empty right half of hero (placeholder, T5 owns); only Escape + localStorage were mutation-checked
FIXBASE_T4=bd50c2a
Task 4: fix round 1/5 submitted (e6fa217); re-review pending
Task 4: fix round 1/5 (2 addressed, 0 open; commits bd50c2a..e6fa217)
Task 4: minor (deferred): a11y.ts allow-list has 3 global selectors (^h1$, ^\.section-heading__eyebrow$, ^\.hero__lead$) that could hide future incompletes if axe coverage grows (scope them); dark --primary-active vs --bg 2.78:1 (transient state, low), dark hover vs --bg 3.24:1 (thin margin if --bg changes); dead disabled-secondary branch in contrast.spec; pixel check uses .first() per selector
Task 4: complete (commits dd91d6b..e6fa217, review clean)
Task 5: Ruling: add a minimal plugin settings page (Settings > IdeaToApps: featured apps selection, YouTube channel URL; nonce + manage_options) because the spec requires a no-code owner to configure these; plan only listed the options — cost if wrong: one small file
Task 5: Ruling: "How it works" copy must be honest (no free trial, no demo for ClipForge): steps "Discover / Watch / Buy once / Download and run", not the spec wireframe's "Try"
BASE_T5=e6fa2174b301fb12f186b3ff619de827281f07da
Task 5: implementer DONE_WITH_CONCERNS (58575d5); concerns: full e2e not run in one go; two 1440 gradient-contrast tests failed once then passed on re-run (flake?); REST can't write app/video meta (no custom-fields support); newsletter part plain POST form (T7 supplies JS); rest_get_server() on every home request; featured fallback when option points at hidden apps; workers:1; shared parts card/section-heading changed; review dispatched
Task 5: review = Needs fixes. Important: (1) intermittent 1440 gradient-contrast flake = probably borderline light-theme hero lead/eyebrow contrast (~4.5-4.9:1 worst pixel) + non-deterministic sampling; (2) rest_get_server() on every home request (inc/home.php ~L1636); (3) settings copy "in the order you picked" is false for a multi-select and the e2e hides it (settings.php ~L1265); (4) silent fallback to latest apps when chosen apps are hidden (inc/home.php ~L1569) -> fix round 1.
Task 5: Ruling (2): add `ideatoapps_newsletter_available(): bool` = (bool) apply_filters('ideatoapps_newsletter_available', false); Task 7 hooks it to true when it registers the route; no REST boot on home — cost if wrong: T7 must remember the filter (carry into T7 dispatch)
Task 5: Ruling (3): drop "order you picked"; featured apps display in the list order shown on the settings page (title order); e2e submits a form-realistic order
Task 5: Ruling (4): keep the fallback to latest apps (site never shows an empty featured area) but add a settings-page notice when the chosen apps are all hidden + description text documenting the fallback
Task 5: minor (deferred): workers:1 serialises the whole e2e suite (scope to serial describe/project); video meta not REST-writable + no editing UI (T7 must add meta box); /learn/ links rely on archive fallback until T7; ideatoapps_home_videos queried twice per request (memoise); IDEATOAPPS_CORE_VERSION must be bumped when later tasks add post types/rewrites; newsletter form plain POST no nonce/JS (T7 owns); a11y allow-list hero eyebrow entry broader; "Download your app from your account" copy promises an account flow that ships in T8; nine decorative hero tiles may read as blank placeholder apps; full `npm run test:e2e` not run in one go (run it in T10 gate)
Task 5: CARRY INTO TASK 7: hook `ideatoapps_newsletter_available` to true when the newsletter route exists; add video meta box (youtube_id, related_app_id) and/or custom-fields support; own the newsletter form JS + nonce/rate limit; Learn template for /learn/
FIXBASE_T5=58575d5
Task 5: fix round 1/5 submitted (f06becd); full e2e 72/72 in one run; re-review pending
Task 5: fix round 1/5 (4 addressed, 0 open; commits 58575d5..f06becd)
Task 5: minor (deferred): ideatoapps_featured_all_hidden() in plugin duplicates the theme's visible-apps meta_query (drift risk; share a helper); light lead on glow at peak alpha 4.92:1 (thin design margin, tests guard it)
Task 5: complete (commits e6fa217..f06becd, review clean)
Task 6: note: seed must be a PHP function `ideatoapps_seed_clipforge(): int` (callable from tests/CLI) + WP-CLI wrapper; production content import is T10; the public app page must NEVER expose the zip/attachment URL (version number + changelog only)
BASE_T6=f06becd3b95ee001132db0a4b8953d66401b3700
Task 6: implementer DONE_WITH_CONCERNS (commit 5e9bb55, base f06becd); concerns are scope notes (woo_product_id meta-box field, /apps/category rewrite + core 0.1.1, requirements stored in content, search excludes tagline). Proceeding to review.
Task 6: review 1 — spec ❌, 3 Important + 1 spec gap: (I1) seed claims Edge/Windows/macOS/Linux and an account-library promise not backed by README; (I2) woo_product_id writable by editors (needs manage_options incl. REST auth_callback) and buy state must require published product; (I3) seed idempotency (trashed app, app without product link); (spec) no SoftwareApplication JSON-LD hook point on single-app.
Ruling: seed product stays live per brief, but a live buy button before any zip exists is a launch risk — carried into T8 (gate via delivery_status/coming_soon until a version file exists; verify before launch) — if wrong: a buyer in test mode gets an order with no file.
Task 6: minor (deferred): catalog.js hides Apply button before capability checks; /apps/category/x/page/N and child terms not in top rewrite rule + untested; ?paged past end shows misleading "no match" state; CatalogTest $_GET reset not explicit; BANNED-word regex brittle.
Task 6: fix round 1/5 implemented (commit 43bde5b), pending scoped re-review of I1,I2,I3,JSON-LD seam
Task 6: fix round 1/5 (4 addressed, 1 new Important open — I-1 seed re-run duplicates a linked-but-trashed or untagged product; commits 5e9bb55..43bde5b)
Task 6: minor (deferred): M-1 schema rating/review stripping is top-level only (make recursive before T9 fills the seam — CARRY TO T9); M-2 updates FAQ points at a What's new section hidden until a version exists; M-3 editor-save test should also post ita_tagline; M-4 seed may pick trashed app over live one with same slug; M-5 write product tag before save().
Task 6: fix round 2/5 implemented (commit 481cf2e), pending scoped re-review of I-1
Task 6: fix round 2/5 (1 addressed, 0 open — I-1 + M-5; commits 43bde5b..481cf2e)
Task 6: minor (deferred): seed slug fallback could retag a product already tagged to another app; published clipforge + trashed clipforge__trashed both present may restore the trashed one; seed restores an admin-trashed product on every run (by design, note for live-site docs — T10).
Task 6: complete (commits f06becd..481cf2e, review clean after 2 fix rounds; 3 unpushed, awaiting user "push")
Ruling: owner supplied the logo (lightbulb + upward arrow, cyan/blue gradient + yellow rays on near-black navy square), saved at .superpowers/sdd/.../logo-source.webp — replaces the wordmark placeholder. Wire in AFTER Task 7 commits (avoid conflicting with the running implementer in the theme): header/footer mark + wordmark text "IdeaToApps", favicon/apple-touch icon, social/OG image, light-mode variant check (square has a dark background, so on the light theme use it as a rounded tile), alt text. Carry to T9 (OG image/favicons) and T10.
Ruling: owner supplied the YouTube channel URL https://www.youtube.com/channel/UCwlwxUoefdwEduU7pT8ctAw (public). It is site content, not code: set it via Settings > IdeaToApps (option ideatoapps_youtube_channel_url) — apply in the T10 content-import/seed and ADMIN_GUIDE; verify home Watch & Learn + footer/Learn link behave with a URL and zero videos (Learn nav stays hidden until >=1 video). Not unverified-claimed as "owner's channel has videos".
Task 7: implementer DONE_WITH_CONCERNS (commit 589f5a6, base 481cf2e). Concerns: no unsubscribe/erasure UI (design doc goal: consent + unsubscribe), nonce printed in cached HTML, limiter trusts REMOTE_ADDR only, Playwright not red-first, T4-6 tests edited, /learn is CPT archive, blog is a Page. Proceeding to review.
Task 7: review 1 — spec ✅ (one tracked gap), 3 Important: (I1) fputcsv eol arg needs PHP 8.1 but plugin declares Requires PHP 8.0 -> export fatals on 8.0; (I2) stale nonce in cached HTML: no retry/refresh in forms.js, core cookie check may mask the friendly message; (I3) rate limiter non-atomic (parallel requests bypass) + shared-IP behind proxy.
Ruling: newsletter "unsubscribe"/erasure and double opt-in are NOT built in T7 (nothing is ever sent, contact disabled). Deferred to T10 as a launch gate: DECISIONS.md/ADMIN_GUIDE must state the list must not be mailed until unsubscribe + double opt-in exist and the owner confirms a mailbox; privacy draft must list the hashed-IP rate-limit transients. Cost if wrong: stored emails with no self-service removal until then.
Ruling: privacy/terms lines "show your past orders"/"account that bought it" are true only after T8 builds accounts — recheck wording at T8 end. Deploy checklist (T10): set ideatoapps_client_ip filter behind a proxy/CDN; exclude form pages from full-page cache or rely on nonce refresh.
Task 7: minor (deferred): no-JS fallback for video play (add "Watch on YouTube" link); pages.php marks slug seeded on WP_Error, possible duplicate on concurrent first requests, trashed faq__trashed not detected; ?pg=99 shows misleading empty state; terms hardcode $24.99; e2e "exactly 2 buttons" assertion fragile and shared 5/min limiter headroom; subscribers appear in core Tools>Export (can_export true).
