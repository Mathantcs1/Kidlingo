# Deploying ideatoapps.net on Bluehost

Audience: the site owner (and whoever helps). Nothing in this repo has been deployed. Following this document is **your** go-ahead
decision; no step here was run against a real Bluehost account, a real domain, real MySQL, real PHP 8.0 or a real Stripe account.
Read "What I verified, and what only you can verify" (last section) before you start.

Stripe stays in **test mode** until you approve live payments (`STRIPE_SETUP.md`). The contact form and the `hello@` / `support@`
mailboxes stay **off** until the mailboxes exist. The privacy policy, terms and refund policy are **drafts**, not legal advice.

## 0. Launch gates (read first; each one is a stop sign)

| # | Gate | Why |
| --- | --- | --- |
| G1 | **Do not mail the newsletter list yet.** Built (Newsletter opt-in task): double opt-in (a sign-up is `pending` until its owner clicks the link in the one confirmation email), a signed unsubscribe link in that email, an "Unsubscribe and delete my data" button, WordPress personal data export/erase for subscribers, and a CSV of **confirmed** subscribers only. The sign-up is **off** until you switch it on (Settings > IdeaToApps > Newsletter sign-up). **Still needed from you before any mail goes out:** a working sender mailbox on the domain with SPF, DKIM and DMARC (section 9), a test that the confirmation email lands in the inbox and not spam, and a mailing tool or composer: **this site sends no newsletter and has no composer, and no List-Unsubscribe header is added (it sends no bulk mail).** Old sign-ups from the single-step form are migrated as `pending`, never `confirmed`, so they are not in the export. | Sending marketing email without confirmed consent and a working opt-out breaks anti-spam rules (CAN-SPAM, GDPR/PECR depending on the reader). Mail from a domain without SPF/DKIM/DMARC is likely to be filtered. |
| G2 | **Set the `ideatoapps_client_ip` filter** if the site sits behind a proxy or CDN (Cloudflare, a Bluehost proxy cache). Snippet in `ENVIRONMENT.md` ("Client IP and the rate limit"). | The form rate limit (5 per minute per visitor) uses the connecting address. Behind a proxy every visitor looks the same, so a few people would block everyone. Without a proxy do nothing. |
| G3 | **Raw zip URL returns 403.** In a private window open the direct address of a release zip. Find it in a test purchase: the download goes through a signed link; then try `https://ideatoapps.net/wp-content/uploads/woocommerce_uploads/` (during Phase A use the temporary URL instead of `ideatoapps.net`, here and in the next sentence) and any file path you can guess or see in the media library. It must answer **403** (or 404), never download. Also open `https://ideatoapps.net/wp-json/wp/v2/media?mime_type=application/zip` (and `/wp-json/wp/v2/media?per_page=100`) in a private window: it must list **no** release zip (an empty list `[]` is right). | Release zips must only reach paying customers. The code moves a zip into `woocommerce_uploads/ideatoapps/<random>/` the moment it is uploaded (before it is saved to any version) and makes the media item private, and relies on WooCommerce's `.htaccess` there. This applies to **every** zip uploaded to the media library while WooCommerce is active, so do not use the media library for public zips. nginx ignores `.htaccess`, and the sandbox could not test it. |
| G3b | **Starter article files are not readable by URL.** In a private window open `https://ideatoapps.net/wp-content/plugins/ideatoapps-core/content/articles/08-your-first-week-with-ai.php`, the old name `.../content/articles/08-your-first-week-with-ai.html`, the folder `.../content/articles/` and `.../content/topics.php` (during Phase A use the temporary URL). Each must show **no article text**: a blank page, 403 or 404. | The plugin folder is under the web root. The article files hold unreviewed AI drafts and the full text of subscriber-only posts. Each file starts with a PHP line that stops a direct request, and `content/.htaccess` plus `index.php` stubs add a second layer (nginx ignores `.htaccess`, so the PHP line is the one that counts). |
| G4 | **Phase B only:** once DNS points at Bluehost, **WordPress Address and Site Address are both `https://ideatoapps.net`** (the apex, no `www`). Settings > General. Never set them earlier (see the warning in section 2). | Canonical links, the sitemap and structured data are hard-wired to the apex. A `www` address would make core's sitemap list the wrong host. |
| G5 | **Trash the default "Sample Page"** (Pages > All Pages) and the default "Hello world!" post if present. | WordPress adds them; they would be listed in the sitemap and public. |
| G6 | **Owner decisions:** refund terms (the Refund page is a draft), sales-tax handling, and working mailboxes. | They are business/legal choices, not code. Not decided in this build. |
| G7 | **Express Checkout (Apple Pay / Google Pay) versus the live-Stripe guard.** The guard only hides the Stripe gateway at checkout while Stripe is in live mode. The Stripe plugin's Express Checkout buttons (product and cart pages) are another surface. Disable them while testing, and verify them before going live. A Stripe setting with no `testmode` value counts as live. | See `STRIPE_SETUP.md`, "Going live". |
| G8 | **Legal pages are DRAFTS** and are still public and indexable. Have them reviewed, or set them to Draft/noindex until they are. | They say so on the page, but a draft is not a policy. |
| G9 | **A backup exists and a restore has been tested** (section 7) before you take a real payment. | A broken update with no tested backup loses orders. |

## 1. Before you start

- You need: Bluehost login, ability to open cPanel/File Manager, the two zips from `npm run site:package` (section 3), a Stripe account (test mode is enough to start).
- PHP: the theme and plugin declare **PHP 8.0 as the minimum**. Choose PHP 8.1 or newer in the Bluehost control panel if offered (MultiPHP Manager in cPanel). The tests ran on PHP 8.3 only; **8.0 is unverified**.
- Do **not** change DNS until you have decided to launch. The work has two phases: **Phase A** (sections 2 to 4) builds and tests the site on the temporary address Bluehost gives you; **Phase B** (sections 5 and 6) switches to `ideatoapps.net` only after DNS points to Bluehost.
- Domain `ideatoapps.net`: who holds the registration and where DNS lives is unknown to this document.

## 2. Phase A: create the WordPress site on the temporary URL

Menu names on Bluehost change; the intent matters more than the wording (unverified against the current dashboard).

> **Phase A rules. Do NOT set Site Address / WordPress Address to `https://ideatoapps.net` yet, and do NOT apply the HTTPS/apex redirect rules
> (rules 1 and 2) of `HTACCESS_SNIPPET.md` yet.** Stay on Bluehost's temporary URL (for example `https://<random>.temp.domains` or the server
> hostname shown in the dashboard) until DNS for `ideatoapps.net` points at this Bluehost account (Phase B, sections 5 and 6).
>
> **Warning: lock-out.** If you set WordPress Address / Site Address to a domain that does not yet resolve to this server, the next page load
> redirects to that domain and you can no longer open wp-admin. Recovery: in `wp-config.php` (File Manager) add, above the line
> `/* That's all, stop editing! */`:
>
> ```php
> define( 'WP_HOME', 'https://<temp-url>' );
> define( 'WP_SITEURL', 'https://<temp-url>' );
> ```
>
> (use your real temporary URL; remove both lines again in Phase B), or edit the `siteurl` and `home` rows of the `wp_options` table in phpMyAdmin
> (your table prefix may differ from `wp_`) back to the temporary URL.

1. Log in to Bluehost > **Websites** > **Add Site** > **WordPress** (or "Empty environment" and install WordPress yourself via the installer in cPanel).
2. Create the site on the **temporary URL** Bluehost offers (you may attach `ideatoapps.net` as the domain later, in Phase B).
3. Let Bluehost issue its SSL certificate for the temporary URL and wait until it opens without a warning (private window).
4. Leave **Settings > General** addresses as they are (the temporary URL), but check that **WordPress Address** and **Site Address** use the real scheme (`https://`, matching how you open the site). The nonce route behind the newsletter and contact forms trusts a request only when its Origin equals the site address in scheme, host and port, so an `http://` address on an https site (or the reverse) makes signed-in visitors get an anonymous nonce and forms may fail. Gate G4 belongs to Phase B.
5. **Settings > Permalinks**: choose **Post name** and Save. (Needed for `/apps/clipforge/`.)
6. Remove Bluehost's bundled sample content and any plugins you do not want (gate G5). A fresh Bluehost WordPress comes with Yoast SEO, MonsterInsights, OptinMonster, WPForms Lite, Jetpack, InstaMigrate, Akismet, Hello Dolly and The Icon Block (seen on a real install, 2026-11). Delete all except **The Bluehost Plugin** (it provides the coming-soon page): Yoast would duplicate our titles, canonical links, structured data and sitemap; MonsterInsights adds tracking the privacy page does not mention; InstaMigrate exposes import endpoints and says to remove it after migration. Installing WooCommerce also adds Bluehost's **Payments & Shipping** plugin (PayPal/Stripe connector): remove it, so the only payment path is the WooCommerce Stripe Payment Gateway.
7. **Keeping the site hidden while you build.** Use **Bluehost's own "Coming Soon" switch** (Bluehost > Home or Settings; confirmed working on a real install). **WooCommerce > Settings > Site visibility is ignored on purpose**: the plugin pins `woocommerce_coming_soon` to `no` (WooCommerce's coming-soon mode would hide cart and checkout), so that page always saves as "Live" and the green **Live** badge in the admin bar always shows. Neither says whether visitors can see the site. Check in a private window: you should see Bluehost's "Coming Soon" page. Logged-in admins still see the real site and can test purchases.

## 3. Build and install the two zips

On a computer with this repository (Node installed), from the repository root:

```bash
npm install
npm run site:package
```

This writes `dist-site/ideatoapps-theme.zip` (top folder `ideatoapps/`) and `dist-site/ideatoapps-core.zip` (top folder `ideatoapps-core/`).
The command **fails and writes nothing** if any file that would ship contains a key-like string (Stripe `sk_`/`pk_`/`rk_`, `whsec_`,
AWS, GitHub, Slack, Google keys, private-key blocks). The zips contain no `.env`, `node_modules`, tests, docs or screenshots.

Upload, in this order:

1. **Plugins > Add New > Upload Plugin**: first **WooCommerce** (search "WooCommerce" in Plugins > Add New and install it; tested with 11.3.0), activate. Skip its setup wizard for now, or complete it with: store country, currency USD, no shipping, no tax yet (gate G6).
2. **Plugins > Add New > Upload Plugin** > `ideatoapps-core.zip` > Activate.
3. **Appearance > Themes > Add New > Upload Theme** > `ideatoapps-theme.zip` > Activate.
4. **Plugins > Add New**: **WooCommerce Stripe Payment Gateway** (free, by WooCommerce). Activate. Keys, webhook and test cards: `STRIPE_SETUP.md`. Tick **Test mode**. In Phase A the webhook endpoint is `<temporary URL>/?wc-api=wc_stripe`; after the switch to the apex (section 6) update or re-create it as `https://ideatoapps.net/?wc-api=wc_stripe` and paste the new signing secret.
5. **WooCommerce > Settings > Payments**: switch off every offline gateway (Cash on delivery, cheque, bank transfer). Those were used only by the browser tests.

Replacing the files later (new theme or plugin zip over the old one) is covered in section 8. If the new version adds pages or URLs the
plugin refreshes its rewrite rules once by itself; if `/apps/...` ever 404s, open Settings > Permalinks and click Save.

**Blog (after step 3, in this order):**

1. **Settings > IdeaToApps > Install starter articles.** Expect "50 created as drafts". Nothing is public yet.
2. **Review and sign off each post** you want live, as `ADMIN_GUIDE.md` (section 7, "Starter articles and human review") describes:
   check the claims, tick all seven checks, type your own name, tick **Mark as human reviewed** and press **Publish**. In the block
   editor the box then says **Signed off. Press Publish again**: press **Publish** a second time.
3. Check that `/blog/`, `/sitemap.xml`, `/feed/` and `/wp-json/wp/v2/posts` show **only signed-off posts**, each with the byline
   "Drafted with AI assistance. Edited and reviewed by <name> on <date>."
4. Run gate **G3b** (the article files are not readable by URL).
5. Purge every cache (LiteSpeed Cache, Bluehost's caching page, any CDN).

The Newsletter sign-up, and with it subscriber-only posts, stays **off** until the email work in section 9 and the counsel decision there
are done.

On activation the plugin creates the pages the theme links to (About, Contact, FAQ, Blog, Privacy, Terms, Refund) as empty shells; the theme
prints their draft text. Cart and checkout pages are converted to WooCommerce's classic shortcodes **once per plugin version**: after the first
install, load `/cart/` and `/checkout/` once yourself and confirm they show the cart and the checkout form. A new plugin version (for example
0.5.0) runs that conversion again, so do the same after every plugin update.

## 4. Add ClipForge, the YouTube channel and the first release

Follow `ADMIN_GUIDE.md`. In short:

1. **Apps > Add New** (or, if Bluehost gives you SSH with WP-CLI, `wp ideatoapps seed-clipforge` creates the ClipForge listing and its WooCommerce product; whether Bluehost offers WP-CLI on your plan is unknown). The seed uses text taken only from ClipForge's README.
2. Upload the ClipForge release zip as version `1.0.0` in the **Versions** box. Until a version file exists the Buy button is not offered ("Coming soon").
3. **Settings > IdeaToApps**: YouTube channel URL `https://www.youtube.com/channel/UCwlwxUoefdwEduU7pT8ctAw`. The Learn menu item appears only once at least one **Video** is published; the channel link alone does not add it.
4. Leave **Contact form** off until the mailbox exists.

## 5. Phase B: HTTPS, apex and headers (`.htaccess`)

Only after DNS points at Bluehost and `https://ideatoapps.net` opens with a valid certificate (section 6). Rules 1 and 2 of the snippet redirect everything to
`https://ideatoapps.net`; applied earlier they send you away from the temporary URL and lock you out. (During Phase A you may paste only the snippet
without rules 1 and 2 if you want the headers and caching.)

Paste the block from `HTACCESS_SNIPPET.md` above `# BEGIN WordPress` in `public_html/.htaccess` (copy the file first). It forces HTTPS,
redirects `www` to the apex, keeps certificate validation requests (`/.well-known/acme-challenge/`) out of the redirects, adds security
headers and cache headers. **It has never run on a real server**; use its "Verify" list. If the site answers 500 after pasting, remove the caching rule (5) first, then the rest in order.

Also check for a Bluehost or Cloudflare setting that redirects HTTP to HTTPS or `www` to the apex; two redirect layers can loop.

## 6. Phase B: DNS, SSL and the switch to the apex (when you decide to go live)

DNS is yours to change; nothing here does it. Typical result: `ideatoapps.net` A record points at the Bluehost IP, `www` is a CNAME to the apex or a second A record.

Order: (1) change DNS and wait until `ideatoapps.net` resolves to Bluehost; (2) attach the domain to the site in Bluehost and let it issue the SSL certificate;
(3) **only then** set Settings > General **WordPress Address** and **Site Address** to `https://ideatoapps.net` (gate G4) and remove any `WP_HOME` / `WP_SITEURL`
lines from `wp-config.php`; (4) apply the redirect rules (section 5); (5) run the checks below.

- `https://ideatoapps.net` opens with a valid padlock. `http://`, `www` and `http://www` each end on `https://ideatoapps.net/` in one redirect.
- `https://ideatoapps.net/robots.txt` lists the sitemap; `/sitemap.xml` opens (it redirects to `/wp-sitemap.xml`).
- View source on the home page: `<link rel="canonical" href="https://ideatoapps.net/">`.
- In Settings > Reading, **do not** tick "Discourage search engines" on the live site (it is on or off by your choice; the site is only indexed when it is off).

## 7. Backup and restore test (gate G9)

Pick **one** method and test it; nothing is installed for you.

- A plugin such as **UpdraftPlus** (free version backs up files + database on a schedule to a remote store you choose). Not installed or tested in this build.
- Bluehost's own backups, if your plan includes them (unknown which tier; some are paid).
- Whatever you choose, back up **both** the database and `wp-content/` (it holds the protected release zips in `uploads/woocommerce_uploads/`).

Restore test (do it once before launch, on a copy or a staging site if you can):

1. Take a full backup. Note the order count, the ClipForge versions and the settings under Settings > IdeaToApps.
2. Make a visible change (add a draft post).
3. Restore the backup. Confirm the draft post is gone and the orders, versions and **release zip files** are still there: sign in as a test buyer, open My account > Downloads, download a zip, check it opens.
4. Write down how long it took and who can do it when you are away.

## 8. Updates and rollback

- Before **any** update (WordPress, WooCommerce, Stripe plugin, our two zips) take a backup (section 7).
- Update on a staging copy first when you can. WooCommerce major versions are the usual risk. The tested versions are WooCommerce 11.3.0 and WordPress 7.x; later versions are untested.
- New theme or plugin zip: Plugins > Add New > Upload; WordPress offers "Replace current with uploaded". The plugin keeps your content (apps, versions, orders) because it lives in the database and in `uploads/`, not in the plugin folder. After a new plugin version (0.5.0 was the blog release, 0.5.1 adds the sender address setting) load `/cart/` and `/checkout/` once and confirm they show the cart and the checkout form: each version re-runs the classic cart/checkout conversion and refreshes the rewrite rules once.
- **Rollback**: re-upload the previous zip (keep every zip you ship, named with its date), or restore the backup. If the site shows a white screen after an update and you must disable the plugin, **first stop the store taking money**: put the store in maintenance mode (or WooCommerce > Settings > Payments: disable the Stripe gateway), and only then deactivate the plugin (Plugins page) or rename its folder in File Manager (`wp-content/plugins/ideatoapps-core` to `ideatoapps-core-off`), then restore the old folder. Without the plugin the **live-Stripe guard, login-for-downloads, no-guest-checkout and the buy gate are all gone**, so the shop would sell and serve downloads with none of those rules until it is back.
- **Never deactivate the plugin while subscriber-only posts exist or starter drafts are being worked on.** Both blog gates live in the plugin: without it, subscriber-only posts show their whole text to everyone, and any draft can be published without a human sign-off.
- Removing a ClipForge version from an app takes it away from the product's downloads; buyers' permission rows are kept (dormant), but whether re-adding the same version re-activates them for earlier buyers is **not tested**, so avoid removing a version a customer already owns; add a newer one instead.

## 9. Email (SPF, DKIM, DMARC) once mailboxes exist

Mailboxes do not exist yet; the contact form stays off. WooCommerce still sends order emails with WordPress's mail function; on shared hosting those can land in spam. Plan:

1. Create the mailbox(es) (for example `support@ideatoapps.net`) and tell WooCommerce and Settings > General to use it.
1a. **Sender address for the plugin's own mails:** in Settings > IdeaToApps > **Sender for site emails** enter that mailbox (for example `admin@ideatoapps.net`, same domain as the site) and a name. It applies to the newsletter confirmation, the reading link and the contact notification only (not WooCommerce). Without it those mails come from `wordpress@ideatoapps.net`. Check Email Deliverability (SPF/DKIM) in cPanel before relying on it.
2. DNS TXT records at wherever DNS is hosted: an **SPF** record (include Bluehost's sending hosts or your mail provider), **DKIM** (Bluehost/cPanel's Email Deliverability page shows the key to publish) and a **DMARC** record starting with `p=none` and an address that receives reports. Tighten DMARC only after reports look clean.
3. Send yourself a test order email and check it is not in spam; consider an SMTP plugin.
4. Only then turn on the Contact form and the Newsletter sign-up (Settings > IdeaToApps); the newsletter sends a confirmation email, so it needs the same working sender. Read G1 before using the list.
5. **Subscriber-only posts** (the "Subscribers only" box) switch on together with the Newsletter sign-up: while it is off every post is open. Once it is on, readers depend on two emails reaching them (the confirmation and the "reading link"), so **do not switch it on before a working sender mailbox with SPF/DKIM/DMARC exists** and you have checked that both emails land in the inbox. Failed sends are counted in the same yellow notice as the confirmations.
   - **Owner decision, flagged (not a code question):** making free reading depend on joining a *marketing* newsletter is a consent question under GDPR/PECR and similar laws (consent must be freely given, and bundling it with access to content can make it invalid). The legal pages are drafts. Have counsel review this before you switch the newsletter on; the decision is yours. If counsel objects, the fallback is to gate on a **confirmed email address without newsletter consent**. That is more than a copy change: a sign-up must record marketing consent separately from the reading confirmation. Already built: every new sign-up stores `newsletter_consent` = 1 (the box is required today), and the CSV of confirmed subscribers skips any row with `newsletter_consent` = 0. Still to build for the fallback: a second, optional "I want the newsletter" tick on the card next to a required "send me the link to read" tick, storing 0 when only reading was asked for, and recording an upgrade to 1 only when the person confirms (so nobody can opt someone else in). The gate itself stays keyed on the `confirmed` status.
   - **Purge every cache after switching the Newsletter sign-up on (or off) and after ticking or unticking a post's "Subscribers only" box.** Pages cached while a post was open keep serving its whole text until purged. The plugin purges LiteSpeed Cache, WP Rocket, W3 Total Cache and WP Super Cache when they are installed; purge any host or CDN cache yourself (Bluehost's caching page, Cloudflare "Purge everything").
   - Page caches: gated pages send `Cache-Control: private, no-store`, `Vary: Cookie` and define `DONOTCACHEPAGE`. **LiteSpeed (and any host cache) must skip requests that carry the `ita_reader` cookie** (LiteSpeed Cache > Excludes > "Do Not Cache Cookies": `ita_reader`), and must not cache the pages of subscriber-only posts.
   - Mail timing: the confirmation and reading-link emails are sent after the answer is finished only where PHP-FPM (`fastcgi_finish_request`) or LiteSpeed (`litespeed_finish_request`) is available, which is the case on Bluehost. On a host with neither, the mail is sent before the connection closes, so a slow answer can hint that an address is a confirmed subscriber.
   - The confirmation link works for 7 days and sets the reading cookie each time its Confirm button is pressed, so a forwarded confirmation email gives access to whoever presses it (unlike the one-time reading link). Accepted: reading is free behind a sign-up and nothing personal is shown to readers.
   - The reading cookie is marked `Secure` only when WordPress knows the request is HTTPS. Behind a proxy or CDN that ends TLS without passing it on, set `$_SERVER['HTTPS'] = 'on'` from `X-Forwarded-Proto` in `wp-config.php` (as for WordPress's own login cookies).

## 10. Launch checklist

- [ ] G1 to G9 above are each closed or accepted in writing.
- [ ] Test purchase in Stripe **test mode** with the cards in `STRIPE_SETUP.md`: success, decline, 3-D Secure, refund from WooCommerce, webhook resend: still one order.
- [ ] Buyer can open My account > Downloads, sees every version, downloads a zip that starts with `PK` and opens; a second account cannot use the first buyer's link.
- [ ] Add a new version (1.0.1) and confirm the earlier buyer sees it without any action (`ADMIN_GUIDE.md`).
- [ ] `/cart/` and `/checkout/` open with the browser console showing **no red errors** (guards `jQuery is not defined` after caching/optimisation plugins).
- [ ] Run the order lookup (My account > Downloads, WooCommerce > Orders) on MySQL: the tests used SQLite.
- [ ] Windows `.bat` and macOS `.command` launchers inside the ClipForge zip run on real Windows and a real Mac (only Linux was tested).
- [ ] A real phone and a real desktop browser look at Home, Apps, the ClipForge page, checkout, My account.
- [ ] No ratings, review counts, testimonials or "as seen on" claims appear anywhere. The site claims Chromium-based desktop tested, Safari untested.
- [ ] Trash "Sample Page" (G5), set permalinks, confirm site address is the apex (G4).
- [ ] `IDEATOAPPS_ALLOW_LIVE_PAYMENTS` is **not** in `wp-config.php` until you approve live payments.
- [ ] No starter post is public without a human sign-off (`/blog/`, `/sitemap.xml`, `/feed/`, `/wp-json/wp/v2/posts`), and each shows the byline.
- [ ] The raw article URL is blocked (G3b): no article text at `.../content/articles/08-your-first-week-with-ai.php`, the `.html` name or the folder.
- [ ] The Newsletter sign-up, and with it subscriber-only posts, stays off until the section 9 email work and the counsel decision are done.
- [ ] LiteSpeed Cache > Excludes > "Do Not Cache Cookies" contains `ita_reader`.
- [ ] Bluehost's own page cache is purged after the Newsletter switch is changed (on or off).
- [ ] Search Console: add the property, submit `https://ideatoapps.net/sitemap.xml` (optional, your account).

## 11. What I verified, and what only you can verify

**Verified in the build sandbox (WordPress Playground on Node, SQLite, Chromium, PHP 8.3):**

- PHPUnit boots real WordPress and WooCommerce (a throw-away SQLite database) and passes in full; the full Playwright chain passes against a local WordPress. Exact totals are in the Task 10 report.
- Playwright against a local WordPress: catalog, app page, buy gate, My account library, signed downloads, a second buyer cannot use the first buyer's link, a later version appears for an earlier buyer, SEO tags, noindex rules, structured data, axe accessibility, contrast, home page weight budget, no script errors on cart and checkout.
- Purchase flow with WooCommerce's offline **Cash on delivery** gateway standing in for Stripe.
- The two zips build, contain only what they should, and the secret scan fails the build when a key-like string is present (mutation-checked).
- ClipForge's own gate (unit tests, typecheck, build) and the buyer zip's launchers on Linux.

**Not verified. Only you (or a real test on the real server) can:**

| Area | Status |
| --- | --- |
| `.htaccess` snippet on Apache/LiteSpeed | Never run. Use its Verify list. |
| Raw zip URL answers 403 (G3) | Skipped in the sandbox: the dev server ignores `.htaccess`. Check in a private window. |
| Starter article files not readable by URL (G3b) | The guard line is checked by PHPUnit (every article and `topics.php`, and the parser refuses a file without it) and by the package test (every shipped article file). The `.htaccess` layer is untested: the dev server ignores it. Check in a private window. |
| Real MySQL | Everything ran on SQLite. The atomic rate-limit counter and the order/download queries are untested on MySQL. |
| PHP 8.0 runtime | Declared as minimum; tests ran on 8.3. |
| Real Stripe | No Stripe keys were ever used. The Stripe form, 3-D Secure, webhooks, webhook replay, refunds through Stripe and Express Checkout are all unverified. |
| Real email | Mail was stubbed. Delivery, spam placement, SPF/DKIM/DMARC are unverified. |
| Backup and restore | Not installed, not tested (section 7). |
| Bluehost dashboard wording, WP-CLI availability, SSL issuing, caching layers | Unknown. |
| Real gzip transfer size and PageSpeed | The 250 kB budget was measured on uncompressed bodies in the dev server. |
| Google rich-result validation | Not run. |
| Browsers | Chromium (desktop and a narrow Chromium viewport) only. Safari, Firefox, real phones are untested. |
| Legal text, tax, refund terms | Drafts / undecided. Not legal advice. |
| Windows and macOS launchers in the ClipForge zip | Untested on real Windows and Mac. |
| Any behaviour of an optimisation/caching/security plugin you add later | Unknown. Test cart, checkout and My account after adding one. |
