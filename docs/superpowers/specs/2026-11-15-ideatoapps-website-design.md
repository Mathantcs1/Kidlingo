# IdeaToApps.net website: design

Status: draft for owner approval. Nothing is built until this is approved.

## Intent
A premium, intuitive home for the IdeaToApps brand on ideatoapps.net: a software showcase that grows into a
marketplace. Day one lists one real product (ClipForge). The owner will add more products later, without code.

## Goals
- Visitors understand in seconds what IdeaToApps is and can open ClipForge.
- Owner adds/edits/unpublishes apps, screenshots, prices, videos and posts from the WordPress admin, no code.
- Runs on the existing Bluehost Business (shared) plan: no new recurring hosting cost.
- Fast, mobile-first, accessible (WCAG 2.2 AA target), dark + light mode, SEO-ready.
- **Checkout is live in phase 1** for ClipForge: one-time $24.99 USD via Stripe hosted checkout (test mode first).
  After buying, the customer logs in to an account and gets that product, and every later version, from their
  library, with a version list and changelog. No access without a verified payment.
- YouTube learning hub, blog, newsletter (consent + unsubscribe), contact form.

## Non-goals (phase 1)
- Subscriptions (need a paid WooCommerce extension; decide later). ClipForge is a one-time purchase.
- A free trial of ClipForge (owner decision: no free trial).
- Hosting heavy app runtimes on Bluehost (Node, Docker, AI, rendering).
- Custom-coded auth/payments outside WordPress.

## Anti-goals
- Any fabricated customer counts, testimonials, ratings, logos, prices or app features.
- Claiming ClipForge features that are only on its roadmap (audio editing, effects, animation).
- Claiming Safari/Mac support: README says Safari is untested; state Chromium desktop as tested.
- Buying the NVMe VPS, changing DNS, or enabling live payments without explicit approval.

## Constraints
- Bluehost Business shared hosting: PHP + MySQL, cPanel. Node/Docker assumed unavailable (to verify: PHP version,
  SSH, cron, memory limit).
- Canonical origin https://ideatoapps.net; one www redirect policy (apex canonical).
- Spec rule: show only verified content; legal pages are drafts pending legal review.

## Approaches considered
1. **WordPress + WooCommerce + custom theme on current plan (chosen by owner).** No new cost; no-code admin; mature
   checkout/downloads/SEO. Trade-off: WordPress upkeep (updates, backups, security plugins); subscriptions cost extra.
2. Custom-coded app on Bluehost NVMe VPS. Most freedom; new monthly cost ($8.49/mo promo, $11.99 renewal) and I would
   own server/security/admin. Rejected for now.
3. Static showcase only. Cheapest; owner cannot add products alone. Rejected.

## Design (as proposed by me; owner to correct)
- **Stack:** WordPress, a custom lightweight block theme (no page-builder bloat), WooCommerce kept installed but
  checkout disabled until there is something to sell. Fonts self-hosted. A small set of vetted plugins only
  (SEO, backups, security, newsletter, caching), listed in the plan with costs.
- **Look:** dark navy/indigo/violet, light mode toggle, tokens from the spec (#0B1230, #7357F5, #367CF5, #16B8B0),
  Inter, 12-20px radii, motion respects reduced-motion.
- **Pages:** Home, Apps (catalog: search/category/filter), App detail, Learn (YouTube), Blog, About, Contact/Support,
  FAQ, Privacy, Terms, Refund (drafts), Login/Account (WooCommerce), plus 404/empty states.
- **Home:** hero ("Useful apps. Brilliant ideas. One place."), featured app (ClipForge), categories, how it works,
  Watch & Learn, newsletter, footer. Modules with no content are hidden, never empty.
- **Apps = a custom post type** with fields: tagline, category, platforms, screenshots, features, FAQ, demo/launch
  URL, price label (or Free), video ID, status (draft / coming soon / live), SEO. This is what makes later products
  no-code.
- **ClipForge listing (day one):** "Buy ClipForge, $24.99 one-time" button (no "Free to try"); after purchase the
  library shows a versioned list of zip downloads with changelog; facts taken from its README only: edits in the browser,
  import/trim/split, layered timeline, formats 16:9/9:16/1:1/4:5, MP4 export up to 4K, local-first (media never leaves
  the device), Chromium desktop tested. "Roadmap" items are not shown as features.
- **ClipForge hosting:** it is a static build, so it can later live on Bluehost (e.g. clipforge.ideatoapps.net or a
  subfolder, with an `.htaccess` SPA rewrite). Phase 1 links to the existing Vercel URL; moving is a separate approved step.
- **Build approach:** I build and verify the theme locally in a WordPress sandbox (Playground/wp-env or equivalent),
  with desktop/mobile screenshots, then deliver a theme zip + content import + `DEPLOYMENT_BLUEHOST.md` and
  `ADMIN_GUIDE.md`. Deploying to the live server needs the owner's cPanel/WordPress access and explicit go-ahead.

## Open items for the owner
1. DECIDED: one-time purchase, $24.99, no free trial. Tax handling, refund terms and currency display still to confirm.
1b. DECIDED: the buyer downloads a versioned zip of the ClipForge build from their account library (no online
   launch for buyers). Each new release is added as a new version; all past buyers can download it.
2. Contact email: hello@/support@ mailboxes do not exist until configured; the contact form is disabled until then.
3. YouTube channel URL (Learn page stays hidden until provided).
4. Logo: none supplied; I will make a simple wordmark placeholder.

## Delivery details and risks (zip download)
- Downloads are protected: files live outside the public web root (or behind a signed, short-lived PHP/WooCommerce
  download link), served only to a logged-in customer with a paid order. Each download is logged.
- Zip contents: the production build, a short README ("how to run it") and a licence file naming the licence terms.
- **VERIFIED (headless Chromium, 2026-11-15): ClipForge does NOT run from file://.** Double-clicking index.html gives
  a blank page (module scripts blocked, OPFS write fails with SecurityError). Served from http://localhost it works
  (app renders, OPFS write ok). So the zip must include a way to serve it locally. Build must use relative asset paths
  (`vite build --base=./`; the current build assumes the site root).
- Launcher plan (builder to confirm): zip ships `start-windows.bat`, `start-mac.command`, `start-linux.sh` that start a
  tiny local server using Python 3 or Node if present, open http://localhost in the browser, and print a clear
  message if neither is found; README lists the one-line manual commands. Mac/Windows may warn on unsigned scripts.
  Alternative (heavier, not chosen yet): per-OS single-file launcher binaries; unsigned binaries trigger stronger
  OS warnings and need code-signing to avoid them.
- A zip can be redistributed; mitigation is licence terms plus per-order download records, not DRM. Stated honestly.
- Page copy must say what is true: runs in a modern Chromium desktop browser; Safari untested.
- Releasing a new ClipForge version = upload a new zip + changelog in the admin; no code change.

## Left to the builder
Exact plugin choices, theme file structure, field plugin vs hand-coded meta boxes, image sizes, caching setup,
sandbox tooling, and the verification checklist.
