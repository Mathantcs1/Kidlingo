# Decisions, plugin choices and costs

Status key: **Decided** (made and built), **Owner** (needs your decision), **Unknown** (could not be verified here; marked so nobody
mistakes it for a fact). Prices are not looked up live in this build: anything about a vendor's price is "check the vendor's page".

## Stack

| Decision | Choice | Cost | Notes |
| --- | --- | --- | --- |
| Hosting | Existing Bluehost Business (shared) plan | No new recurring cost (per the design spec) | Decided. PHP/MySQL only: no Node, Docker or rendering on the server. Which PHP version, SSH/WP-CLI and PHP memory limit are Unknown until checked on the account. |
| CMS | WordPress 7.x | Free | Decided. Tested on 7.x core in the sandbox. |
| Commerce | WooCommerce (tested 11.3.0) | Free core | Decided. Subscriptions, if ever wanted, need a paid extension: price Unknown, check WooCommerce.com. Not built (non-goal for phase 1). |
| Payments | **WooCommerce Stripe Payment Gateway** (free, official) | Plugin free; Stripe charges per transaction | Decided. Test mode only until you approve. Card data never reaches the site (Stripe-hosted fields). See fee note below. |
| Theme | Custom `ideatoapps` theme: PHP templates plus `theme.json`, no page builder | Free (own code) | Decided. The design spec said "block theme"; the build uses classic PHP templates with a `theme.json`, to keep control of markup and weight. Fonts (Inter) are self-hosted, licence OFL in the theme. |
| Business logic | Custom `ideatoapps-core` plugin: apps, videos, versions, downloads, settings, SEO, rate-limited forms | Free (own code) | Decided. Hand-written meta boxes instead of a custom-fields plugin (fewer moving parts and updates). |
| SEO | Own minimal implementation (canonical, titles, descriptions, Open Graph, JSON-LD, robots.txt, sitemap tweaks) | Free | Decided. It switches itself off if Yoast, Rank Math, AIOSEO, SEOPress or The SEO Framework is activated. Not compared against those plugins feature by feature. |
| Newsletter | Double opt-in sign-up: `pending` until the visitor confirms via a signed link in one plain-text confirmation email; signed unsubscribe link, unsubscribe-and-delete, WordPress privacy export/erase, confirmed-only CSV. Switch off by default. **Sends no marketing email and has no composer.** | Free | Decided. **No mailing service chosen** (Owner): cost depends on the tool, Unknown. Before mailing: sender mailbox + SPF/DKIM/DMARC (launch gate G1). |
| Contact form | Built, **off** until a mailbox exists | Free | Owner: create the mailbox, then switch it on (Settings > IdeaToApps). |
| Backups | **Not installed.** UpdraftPlus-style plugin or Bluehost's own backup suggested | Free tier exists for UpdraftPlus; Bluehost backup tier and price Unknown | Owner. Launch gate G9: restore must be tested. |
| Security plugin | **Not installed.** Server headers via `.htaccess`; WordPress/plugin updates | Free options exist (name one only after you test it); Bluehost's own tools Unknown | Owner. Unverified: whether any security plugin conflicts with checkout. |
| Caching / CDN | **None.** Long cache on theme assets via `.htaccess` | Free | Owner. Never cache `/cart/`, `/checkout/`, `/my-account/`. Unverified with a caching plugin. |
| Transactional email | WordPress default mail, not configured | Free to $ depending on provider (Unknown) | Owner. Order emails may land in spam on shared hosting; SMTP plugin and SPF/DKIM/DMARC advised (`DEPLOYMENT_BLUEHOST.md` section 9). |
| SSL | Bluehost's free SSL (expected) | Free | Unknown until issued. |
| ClipForge app hosting | Not on this site. Buyers download a zip and run it locally. | None | Decided. The public ClipForge page links nowhere to a live online app. ClipForge on Vercel is unchanged and untouched by this site. |

## Stripe fees (Unknown for your account)

Stripe's usual published US card rate is a percentage plus a fixed amount per successful charge, with extra for international cards or
currency conversion. Your actual rate depends on your country and account. **Check it in your Stripe dashboard (Settings > Pricing) before
you decide the price.** Stripe's fee is not refunded on a refund in some regions; check the current terms. Nothing in the site computes fees,
and no fee figure is shown to visitors.

## Behaviour decisions made while building (each came from review)

- One-time purchase of **$24.99 USD**, no free trial, no subscription. The charged price comes from the WooCommerce product only, never from the browser. The displayed price (Buy button, card, FAQ, Terms) is read from that same product (a valid SIMPLE product only, the same test as the JSON-LD offer; a variable product falls back to the label; JSON-LD uses the store's price decimals like the page; cost: the card already loads the product, so no extra query beyond cached post meta); the free-text "Price label" is only a fallback when no published product with a price is linked (review fix: the label could differ from the charge).
- **Accounts are required to buy** (guest checkout is forced off, and cannot be turned back on in wp-admin). Downloads require login and are always streamed by WooCommerce, never redirected to the file.
- **Versions**: each release is a version (x.y.z) with a changelog and a zip. The zip is moved to WooCommerce's protected uploads folder the moment it is uploaded (not when the version is saved); saving a version adds it to the product, and gives access to every earlier buyer with a qualifying order. Removing a version takes the file off the product and keeps old permission rows dormant.
- **Buy gate**: the Buy button and `?add-to-cart=` both require the app to be Published, Live, linked to a published product and to have a valid version file. A crafted URL gets the same answer as the button.
- **Live Stripe is blocked** unless `wp-config.php` defines `IDEATOAPPS_ALLOW_LIVE_PAYMENTS`. A Stripe setting with no testmode value is treated as live. Express Checkout (Apple Pay / Google Pay) is a separate Stripe feature the guard does not cover: launch gate G7.
- **Admin-only fields**: linking a WooCommerce product to an app is for administrators; a version's file can be set only by an administrator or the user who uploaded it.
- **Rate limit** on the newsletter and contact forms: 5 per minute per visitor, atomic counter, no plain-text IP. Behind a proxy set the `ideatoapps_client_ip` filter (gate G2).
- **Pages and SEO**: canonical links and the sitemap use the constant `https://ideatoapps.net`. Private and transactional pages carry `noindex, follow`; `/my-account/`, `/cart/`, `/checkout/` are also disallowed in `robots.txt`. Reason for both, and when to drop `Disallow`: `ENVIRONMENT.md` ("Checks added in Task 10"). Learn and other empty modules are hidden, never shown empty.
- **No fabricated claims**: no ratings, review counts, testimonials or customer numbers; no "free trial"; no roadmap features presented as shipped. The site says ClipForge is tested in Chromium on desktop and Safari is untested.
- **"How it works"** copy: Discover, Watch, Buy once, Download and run. No "Try".
- **Legal pages** (Privacy, Terms, Refund policy) are DRAFTS with a visible banner, not legal advice. The banner is part of the theme and stays until a developer removes it.
- **Logo**: supplied by the owner (lightbulb with an upward arrow). It is used as supplied on a rounded tile for the light theme.
- **YouTube channel**: `https://www.youtube.com/channel/UCwlwxUoefdwEduU7pT8ctAw`, entered under Settings > IdeaToApps. The Learn menu appears only after a video is published.

## Known limits (accepted for phase 1)

- **Every zip becomes private while WooCommerce is active.** Not only release zips: ANY .zip uploaded to the media library (a brochure, a font pack) is moved to the protected folder and made private, so it will not load from its media-library URL and is not listed publicly. Reason: a zip cannot be told apart from a release zip at upload time. Put downloads meant for the public somewhere else (or as a non-zip). Editors and Administrators see every zip in the version picker; Authors see only the zips they uploaded (`includes/media-picker.php`; nothing is exposed publicly); a file that is not a real zip (.zip extension and PK header) is left alone, and the version row shows a notice that buying stays off until a valid zip is attached.

- The FAQ and Terms price text falls back to the launch price `$24.99 USD` when no ClipForge app with a priced, published product exists. Prose you type yourself in editors is not updated automatically (`ADMIN_GUIDE.md` section 2).
- The newsletter now has double opt-in, unsubscribe and erasure, but is not mailed yet (gate G1: sender mailbox, SPF/DKIM/DMARC, no composer); the privacy draft must list the hashed rate-limit counters (they hold a hash of the IP, not the IP).
- Checkout asks only for name and email: no billing address or phone. Revisit if you need tax by postcode or Stripe Radar rules.
- A deleted media file leaves a stale product file entry; the buy gate then switches the Buy button off rather than selling something that cannot be delivered.
- Buying with Cash on delivery (used by tests) leaves an on-hold order with no access; keep offline gateways off.
- The download zip can be shared by a buyer; the answer is licence terms plus per-order download records, not DRM.

## Owner items still open

1. Refund terms (days, conditions) and the Refund page text.
2. Sales tax / VAT handling and registration (not configured).
3. Mailboxes (`hello@`, `support@`) and which address goes on the Contact page and in WooCommerce emails.
4. A mailing service, and the unsubscribe / double opt-in plan before anything is sent.
5. Review of the draft Privacy, Terms and Refund pages by someone qualified.
6. Backup method and who performs a restore.
7. Permission to turn on live Stripe (`STRIPE_SETUP.md`, "Going live").
8. Whether and when ClipForge itself should be hosted on Bluehost (separate approved step; the current Vercel deployment is untouched).
