# Admin guide (no coding needed)

For the person who runs ideatoapps.net day to day. You work in the WordPress admin: `https://ideatoapps.net/wp-admin/` (during Phase A, before launch, use the temporary URL Bluehost gave you instead).
This guide describes the screens as built in this project and checked in a local test site. Bluehost-specific screens are not covered
here (see `DEPLOYMENT_BLUEHOST.md`). Words in **bold** are the exact labels you will see.

Safety rules that never change:

- Payments stay in **Stripe test mode** until you decide otherwise. No real card is charged in test mode.
- Do not email the newsletter list (launch gate G1). The site sends only the one confirmation email per sign-up; it has no newsletter composer, and you still need a working sender mailbox with SPF/DKIM/DMARC before any mail goes out.
- The **Contact form** stays off until a real mailbox exists.
- Privacy, Terms and Refund pages are **drafts**, not legal advice.
- Never type a Stripe key anywhere except WooCommerce > Settings > Payments > Stripe. Never paste one in an email, chat or page.

## 1. Publish an app (or unpublish one)

1. Left menu: **Apps > Add New**.
2. Type the app name as the title. Write the long description in the main editor (this shows under "Requirements" on the app page).
3. Add a **Featured image** (right column): the main screenshot. Add an **App category** if you use categories.
4. Fill the **Product details** box:
   - **Tagline**: one sentence under the title.
   - **Platforms**: what it runs on. Only write what has been tested.
   - **Price label**: fallback text such as `$24.99 one-time`, used only when no WooCommerce product is linked; otherwise the price comes from the product (section 2).
   - **Launch URL / Demo URL / Video ID**: leave empty if you have none.
   - **Delivery status**: **Draft** (hidden from the catalog), **Coming soon** (listed, no price, no buy button) or **Live**.
   - **Features**: one per line. **FAQ**: click **Add question** for each question and answer.
   - **WooCommerce product ID** (administrators only): the number of the WooCommerce product that is charged (section 2).
5. Click **Publish** (top right). To hide an app later: set **Delivery status** to **Draft**, or move it to Trash, then **Update**.
6. Open the app page and check it. The **Buy** button appears only when all of these are true: the app is Published, status is **Live**, it is linked to a published WooCommerce product, and at least one version file is attached (section 4). If the button says "Coming soon", one of those is missing.

The app page never shows a download link. Only a signed-in buyer gets the file.

**First time on a new live site:** the ClipForge listing is created from ClipForge's README text by a one-time command (`wp ideatoapps seed-clipforge`, needs SSH/WP-CLI, availability on Bluehost unknown). Without it, create the app by hand with the steps above and create its product as in section 2.

## 2. Change the price

Change it in **one** place: **Products** (WooCommerce) > open ClipForge > **Regular price** (or **Sale price**) > **Update**. No developer edit is needed:

- The Buy button ("Buy ClipForge, $29.99 one-time"), the app card, the **FAQ** answer "What does it cost?" and the draft **Terms** page all read the price from that WooCommerce product, so they change with it. The checkout charge and the structured data (search engines) use it too.
- The app's **Price label** (Product details) is now only a fallback, shown when the app has no linked, published WooCommerce product with a price. You can leave it as it is when a product is linked.
- If you wrote your own sentences with a price in the Terms or FAQ editor text, or in the app's long description, those are plain text and you must edit them yourself.

Currency is USD only. A price change affects new purchases only. People who already bought keep their access.

## 3. Add a video (Learn page)

1. **Videos > Add New**. Title = what the video is about. Add a short description in the editor.
2. In **Video details**: paste the YouTube link (or the 11-character video ID) into **YouTube link or video ID**, and optionally pick a **Related app**.
3. **Publish**. The **Learn** item in the menu appears automatically once at least one video is published, and disappears again if there are none.
4. The YouTube channel link used on the home page and in the footer: **Settings > IdeaToApps > YouTube channel URL**. Enter
   `https://www.youtube.com/channel/UCwlwxUoefdwEduU7pT8ctAw` and **Save**. Do not claim the channel has videos until it does: the Learn page shows what you publish here, nothing else.

## 4. Upload a new ClipForge version

Past buyers get every new version automatically (see below). To release one:

1. Build the new zip (developer step): `node scripts/package-clipforge.mjs --version 1.1.0 --out dist-zip` in the repository produces `ClipForge-1.1.0.zip`.
2. **Apps > ClipForge** (open it). Scroll to the **Versions** box.
3. Under **Add a version**: type the number in **Version (x.y.z)**, for example `1.1.0` (three numbers separated by dots; it must not already exist. The site does not check that it is higher than the last one, so pick the next number yourself). Write what changed in **Changelog**.
4. Click **Choose file**. In the window that opens, **Upload files** and pick `ClipForge-1.1.0.zip` (or choose it if already uploaded), then **Choose**.
5. Click **Update** (top right). A message appears if the version number is invalid or already exists; read it.
6. Check: the **Versions** table now lists 1.1.0 with the file name. Open the public app page: it shows the version number and changelog (never a download link).

**How past buyers get it:** when you save a new version, the site gives every customer who already bought ClipForge (completed or processing order, not refunded or cancelled) download permission for it. They do nothing: next time they open **My account > Downloads** ("My library") the new version is at the top with your changelog and a **Download** button. No email is sent about it (email delivery is not set up), so tell them yourself if you want them to know. The old versions stay available to them. Someone who bought **before** 1.1.0 exists and someone who buys **after** both see every version.

Notes: a version's file can be set only by an administrator or the person who uploaded it. Avoid **Remove** on a version someone already owns; add a newer one instead. The zip is moved into a protected folder the moment it is uploaded to the media library (before you save the version) and the media item becomes private; the public media library address of the zip must not be shared.

**Every zip you upload becomes private while WooCommerce is active.** This applies to any `.zip` added through the media library or the Versions picker, not only release zips, so a public zip for a blog post or a free download will not work: host such files elsewhere (another service, or a plain link). If you choose a file that is not a real zip, or someone else's upload, the page shows a yellow notice after **Update** explaining what was ignored (buying stays off until a real zip is attached). In **Choose file**, administrators and editors see every zip; authors see only the zips they uploaded themselves.

## 5. Handle an order

Left menu: **WooCommerce > Orders**.

- **Processing / Completed** = paid. The buyer already has access in **My account > Downloads**. Nothing else is needed, nothing is shipped.
- **Pending payment** = the card was not completed (abandoned). No access is given. Do nothing, or cancel it after a few days.
- **On hold** = not paid yet (this happens with offline gateways, which should be off on the live site). No access until it is paid.
- **Failed** = the card was declined. No access.
- Open an order to see the customer, the product and the Stripe payment note. A buyer who writes to you can be matched by the email on the order.
- An account is required to buy. If a customer lost their password they use **Lost your password?** on the login page.
- You can add a private **order note**; do not put card numbers or keys in notes. The site never receives card numbers: they go to Stripe.

## 6. Refund

1. **WooCommerce > Orders** > open the order > **Refund**.
2. Enter the amount (the full price for a full refund), tick the ClipForge line, add a reason, and click **Refund $24.99 via Stripe** (the label shows the amount). On a test-mode order this refunds the test payment only.
3. A full refund or cancellation changes the order status, and WooCommerce then stops the download links of that order. Later new versions are not given to a refunded line.
4. Check in **Stripe dashboard > Payments** that the refund shows there. **Not verified in this build:** a refund sent through real Stripe (the tests used a stand-in payment method and checked the access rules). Do one test-mode refund before launch.
5. The refund terms (how many days, in what cases) are a business decision. The **Refund policy** page is a draft; decide and edit it before taking real payments.

## 7. Everyday settings and other tasks

- **Settings > IdeaToApps**: **Featured apps** on the home page (leave empty to show the latest), **YouTube channel URL**, **Contact form** on/off (keep off until a mailbox exists) and **Newsletter sign-up** on/off (also keep off until the site can really send mail: each sign-up triggers a confirmation email). While it is off the home page says "Sign-up is not open yet".
- **Newsletter sign-ups** (double opt-in): **Tools > Newsletter list**. A new sign-up is **pending**: it gets one confirmation email (at most one more every 10 minutes if the same address tries again) and becomes **confirmed** only when the person opens the link and presses **Confirm my sign-up** (the link works for 7 days). **Unsubscribed** means they pressed **Unsubscribe**: we keep only the address, the status and the time so the opt-out is honoured. **Unsubscribe and delete my data** removes the row completely. The page shows the counts and every stored address with its status.
  - **Download CSV of confirmed subscribers** contains only confirmed addresses (columns email, consent_at, confirmed_at, status). Pending and unsubscribed addresses are never exported.
  - To remove people: tick rows, choose **Delete permanently** under Bulk actions and press Apply (no trash, cannot be undone). Erasure requests also work from **Tools > Erase Personal Data** (enter the email).
  - If the site could not send some confirmation emails, a yellow notice on this page and on **Settings > IdeaToApps** says how many (never which address); those people stay pending and can sign up again. The confirmation is sent just after the sign-up answer, so the form says the same thing for everyone.
  - The CSV is the only export of this list: the subscriber type is left out of **Tools > Export**.
  - Some security plugins rotate the WordPress salts automatically; that invalidates every unsubscribe link already emailed, so keep salt rotation off once you mail the list.
  - Do not mail the CSV anywhere yet (gate G1): this site does not send newsletters and there is no composer.
- **Pages**: About, FAQ, Contact, Blog, Privacy, Terms and Refund policy are under **Pages**. The three legal pages always show a DRAFT notice; that notice is part of the theme and needs a developer to remove once the text is reviewed.
- **Blog posts**: **Posts > Add New**.
- **Starter articles and human review**: **Settings > IdeaToApps > Starter articles** has the **Install starter articles** button. It creates each article file as a **draft** post (with its category); pressing it again never changes, recreates or publishes anything, including posts you edited or trashed. These articles are AI-drafted and **cannot be published until a person signs them off**: open the draft, find the **Editorial review** box, work through **Check these claims first**, tick all seven checks, type **your own name** in **Reviewer name** (it is never filled in for you), tick **Mark as human reviewed** and press **Publish** (or **Update**). In the block editor the first press saves the post as a draft and then saves your sign-off, so the box says **Signed off. Press Publish again**: press **Publish** a second time and the post goes live (the classic editor signs and publishes in one press). If the sign-off is refused (no name, fewer than seven ticks, expired form, or your account cannot publish posts) the box says why and keeps what you typed. Only after a sign-off can the post go live; before that any publish, schedule, bulk or quick edit puts it back to draft with the notice "Not published: needs human review". The public byline then reads "Drafted with AI assistance. Edited and reviewed by <name> on <date>." and "Last reviewed" shows the date of your review. If you change the title, summary or text of a reviewed post it goes back to **Needs review** (and to draft if it was live); tick the checks again and use **Re-sign**. **Posts > Review column** and its filter show AI draft, Needs review and Human reviewed; the Settings section shows "N of M starter articles human reviewed". Your own posts (not starter articles) are not affected.
- **Subscribers only** (box in the post editor, under **Editorial review**): tick it to make a post subscriber-only. Visitors then see the opening of the article (about 120 words, up to the next heading, never a prompt box, quiz, checklist or table), a short fade and a card that offers the free newsletter sign-up. The rest of the article is **not sent** to them at all (not hidden with styling): it is also left out of the REST API, the RSS feed, excerpts and the page description. Site search (and the blog search) finds a subscriber-only post only by its title and summary, not by words that appear only in the locked part (subscribers and editors still find it by its text). A post with page breaks always shows the opening of page 1, and its later pages send visitors back to it. The six longest practical starter guides (08, 14, 32, 36, 42 and 44) arrive with the box ticked; you can change any post. The box is the only place to change this setting.
  - **It does nothing while the Newsletter sign-up is off** (Settings > IdeaToApps): then everyone reads every post in full, so nobody is locked out with no way in. The box says so.
  - **How readers get access:** they sign up on the card, then press **Confirm my sign-up** in the confirmation email. Confirming unlocks every subscriber-only post in the browser where they press Confirm, for 180 days (a signed cookie). On a new device, or after clearing cookies, they use **Already subscribed? Email me a reading link** on the card: if the address is a confirmed subscriber we email a link that works once, for one day; pressing its button unlocks that browser. At most one such email per 10 minutes and 3 per day per subscriber, and 60 per hour for the whole site. The form answers the same for every address, so it cannot be used to find out who is on the list.
  - **Unsubscribing or deleting the address locks access at once**, on every device (each page view checks that the subscriber is still confirmed).
  - You (and anyone who can edit the post) always see the whole post. Gated pages tell page caches not to store them (`Cache-Control: private, no-store`). **After switching the newsletter on or off, or changing this box, purge your caches** (`DEPLOYMENT_BLUEHOST.md` section 9): the plugin purges the common cache plugins itself, but a host or CDN cache may still hold the old, open page.
  - Do not put a **Latest Posts** block set to show full post content (or any block that prints a post's full text) on a page: such blocks print the raw text of every post, including the locked part of subscriber-only posts. The excerpt and title options are fine.
  - A password-protected post that is also subscriber-only shows only its password form to visitors; its text is never used for a teaser or description.
  - Before you switch the newsletter on to use this, read the legal note in `DEPLOYMENT_BLUEHOST.md` section 9 (item 5): tying reading to a newsletter sign-up is your decision to check with counsel.
- **Updates**: before updating WordPress or plugins, take a backup first (`DEPLOYMENT_BLUEHOST.md` section 7). Do not update WooCommerce the same day as a launch.
- **Never** delete the **IdeaToApps Core** plugin or the **IdeaToApps** theme, and do not turn off WooCommerce: apps, versions and downloads depend on them.

## 8. If something looks wrong

| You see | Try |
| --- | --- |
| `/apps/...` pages show "not found" | **Settings > Permalinks** > **Save Changes** (no changes needed). |
| App page says "Coming soon" instead of Buy | Check section 1 step 6: Published, Live, product linked and published, a version file attached. |
| A buyer says they cannot download | Their order must be Completed or Processing and not refunded. Ask them to sign in with the email used at purchase and open **My account > Downloads**. You cannot sign in as them; check the order status and email on the order instead. |
| Checkout errors or a blank checkout | Open the page with the browser console open, note the red error, disable the most recent plugin, and ask a developer. |
| Anything involving keys, payments going live or the zip being public | Stop and read `STRIPE_SETUP.md` and gate G3 in `DEPLOYMENT_BLUEHOST.md`. |
