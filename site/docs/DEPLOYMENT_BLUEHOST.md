# Deploying ideatoapps.net on Bluehost

Audience: the site owner (and whoever helps). Nothing in this repo has been deployed. Following this document is **your** go-ahead
decision; no step here was run against a real Bluehost account, a real domain, real MySQL, real PHP 8.0 or a real Stripe account.
Read "What I verified, and what only you can verify" (last section) before you start.

Stripe stays in **test mode** until you approve live payments (`STRIPE_SETUP.md`). The contact form and the `hello@` / `support@`
mailboxes stay **off** until the mailboxes exist. The privacy policy, terms and refund policy are **drafts**, not legal advice.

## 0. Launch gates (read first; each one is a stop sign)

| # | Gate | Why |
| --- | --- | --- |
| G1 | **Do not mail the newsletter list.** The sign-up form stores an email and a consent time; nothing is ever sent. There is no unsubscribe link, no double opt-in and no self-service erasure. Do not export the list into a mailing tool until all of those exist and you confirm a real mailbox. | Sending marketing email without unsubscribe or confirmed consent breaks anti-spam rules (CAN-SPAM, GDPR/PECR depending on the reader). |
| G2 | **Set the `ideatoapps_client_ip` filter** if the site sits behind a proxy or CDN (Cloudflare, a Bluehost proxy cache). Snippet in `ENVIRONMENT.md` ("Client IP and the rate limit"). | The form rate limit (5 per minute per visitor) uses the connecting address. Behind a proxy every visitor looks the same, so a few people would block everyone. Without a proxy do nothing. |
| G3 | **Raw zip URL returns 403.** In a private window open the direct address of a release zip. Find it in a test purchase: the download goes through a signed link; then try `https://ideatoapps.net/wp-content/uploads/woocommerce_uploads/` and any file path you can guess or see in the media library. It must answer **403** (or 404), never download. | Release zips must only reach paying customers. The code moves zips into `woocommerce_uploads/ideatoapps/<random>/` and relies on WooCommerce's `.htaccess` there. nginx ignores `.htaccess`, and the sandbox could not test it. |
| G4 | **WordPress Address and Site Address are both `https://ideatoapps.net`** (the apex, no `www`). Settings > General. | Canonical links, the sitemap and structured data are hard-wired to the apex. A `www` address would make core's sitemap list the wrong host. |
| G5 | **Trash the default "Sample Page"** (Pages > All Pages) and the default "Hello world!" post if present. | WordPress adds them; they would be listed in the sitemap and public. |
| G6 | **Owner decisions:** refund terms (the Refund page is a draft), sales-tax handling, and working mailboxes. | They are business/legal choices, not code. Not decided in this build. |
| G7 | **Express Checkout (Apple Pay / Google Pay) versus the live-Stripe guard.** The guard only hides the Stripe gateway at checkout while Stripe is in live mode. The Stripe plugin's Express Checkout buttons (product and cart pages) are another surface. Disable them while testing, and verify them before going live. A Stripe setting with no `testmode` value counts as live. | See `STRIPE_SETUP.md`, "Going live". |
| G8 | **Legal pages are DRAFTS** and are still public and indexable. Have them reviewed, or set them to Draft/noindex until they are. | They say so on the page, but a draft is not a policy. |
| G9 | **A backup exists and a restore has been tested** (section 7) before you take a real payment. | A broken update with no tested backup loses orders. |

## 1. Before you start

- You need: Bluehost login, ability to open cPanel/File Manager, the two zips from `npm run site:package` (section 3), a Stripe account (test mode is enough to start).
- PHP: the theme and plugin declare **PHP 8.0 as the minimum**. Choose PHP 8.1 or newer in the Bluehost control panel if offered (MultiPHP Manager in cPanel). The tests ran on PHP 8.3 only; **8.0 is unverified**.
- Do **not** change DNS until you have decided to launch. Build and check on a temporary address first if Bluehost gives you one.
- Domain `ideatoapps.net`: who holds the registration and where DNS lives is unknown to this document.

## 2. Create the WordPress site

Menu names on Bluehost change; the intent matters more than the wording (unverified against the current dashboard).

1. Log in to Bluehost > **Websites** > **Add Site** > **WordPress** (or "Empty environment" and install WordPress yourself via the installer in cPanel).
2. Choose the domain `ideatoapps.net`. Choose the **apex** (no `www`).
3. Let Bluehost issue the free SSL certificate and wait until `https://ideatoapps.net` opens without a warning (private window).
4. WordPress admin > **Settings > General**: set **WordPress Address (URL)** and **Site Address (URL)** to `https://ideatoapps.net` (gate G4).
5. **Settings > Permalinks**: choose **Post name** and Save. (Needed for `/apps/clipforge/`.)
6. Remove Bluehost's bundled sample content and any plugins you do not want (gate G5).

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
4. **Plugins > Add New**: **WooCommerce Stripe Payment Gateway** (free, by WooCommerce). Activate. Keys, webhook and test cards: `STRIPE_SETUP.md`. Tick **Test mode**.
5. **WooCommerce > Settings > Payments**: switch off every offline gateway (Cash on delivery, cheque, bank transfer). Those were used only by the browser tests.

Replacing the files later (new theme or plugin zip over the old one) is covered in section 8. If the new version adds pages or URLs the
plugin refreshes its rewrite rules once by itself; if `/apps/...` ever 404s, open Settings > Permalinks and click Save.

On activation the plugin creates the pages the theme links to (About, Contact, FAQ, Blog, Privacy, Terms, Refund) as empty shells; the theme
prints their draft text. Cart and checkout pages are converted to WooCommerce's classic shortcodes **once per plugin version**: after the first
install, load `/cart/` and `/checkout/` once yourself and confirm they show the cart and the checkout form.

## 4. Add ClipForge, the YouTube channel and the first release

Follow `ADMIN_GUIDE.md`. In short:

1. **Apps > Add New** (or, if Bluehost gives you SSH with WP-CLI, `wp ideatoapps seed-clipforge` creates the ClipForge listing and its WooCommerce product; whether Bluehost offers WP-CLI on your plan is unknown). The seed uses text taken only from ClipForge's README.
2. Upload the ClipForge release zip as version `1.0.0` in the **Versions** box. Until a version file exists the Buy button is not offered ("Coming soon").
3. **Settings > IdeaToApps**: YouTube channel URL `https://www.youtube.com/channel/UCwlwxUoefdwEduU7pT8ctAw`. The Learn menu item appears only once at least one **Video** is published; the channel link alone does not add it.
4. Leave **Contact form** off until the mailbox exists.

## 5. HTTPS, apex and headers (`.htaccess`)

Paste the block from `HTACCESS_SNIPPET.md` above `# BEGIN WordPress` in `public_html/.htaccess` (copy the file first). It forces HTTPS,
redirects `www` to the apex, keeps certificate validation requests (`/.well-known/acme-challenge/`) out of the redirects, adds security
headers and cache headers. **It has never run on a real server**; use its "Verify" list. If the site answers 500 after pasting, remove the caching rule (5) first, then the rest in order.

Also check for a Bluehost or Cloudflare setting that redirects HTTP to HTTPS or `www` to the apex; two redirect layers can loop.

## 6. DNS and SSL checks (when you decide to go live)

DNS is yours to change; nothing here does it. Typical result: `ideatoapps.net` A record points at the Bluehost IP, `www` is a CNAME to the apex or a second A record.

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
- New theme or plugin zip: Plugins > Add New > Upload; WordPress offers "Replace current with uploaded". The plugin keeps your content (apps, versions, orders) because it lives in the database and in `uploads/`, not in the plugin folder.
- **Rollback**: re-upload the previous zip (keep every zip you ship, named with its date), or restore the backup. If the site shows a white screen after an update, rename the new plugin folder in File Manager (`wp-content/plugins/ideatoapps-core` to `ideatoapps-core-off`) to disable it, then restore the old folder.
- Removing a ClipForge version from an app takes it away from the product's downloads; buyers' permission rows are kept (dormant), but whether re-adding the same version re-activates them for earlier buyers is **not tested**, so avoid removing a version a customer already owns; add a newer one instead.

## 9. Email (SPF, DKIM, DMARC) once mailboxes exist

Mailboxes do not exist yet; the contact form stays off. WooCommerce still sends order emails with WordPress's mail function; on shared hosting those can land in spam. Plan:

1. Create the mailbox(es) (for example `support@ideatoapps.net`) and tell WooCommerce and Settings > General to use it.
2. DNS TXT records at wherever DNS is hosted: an **SPF** record (include Bluehost's sending hosts or your mail provider), **DKIM** (Bluehost/cPanel's Email Deliverability page shows the key to publish) and a **DMARC** record starting with `p=none` and an address that receives reports. Tighten DMARC only after reports look clean.
3. Send yourself a test order email and check it is not in spam; consider an SMTP plugin.
4. Only then turn on the Contact form (Settings > IdeaToApps) and read G1 before using the newsletter list.

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
