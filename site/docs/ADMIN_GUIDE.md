# Admin guide (no coding needed)

For the person who runs ideatoapps.net day to day. You work in the WordPress admin: `https://ideatoapps.net/wp-admin/`.
This guide describes the screens as built in this project and checked in a local test site. Bluehost-specific screens are not covered
here (see `DEPLOYMENT_BLUEHOST.md`). Words in **bold** are the exact labels you will see.

Safety rules that never change:

- Payments stay in **Stripe test mode** until you decide otherwise. No real card is charged in test mode.
- Do not email the newsletter list. The site only stores sign-ups; there is no unsubscribe yet.
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
   - **Price label**: the words shown to visitors, for example `$24.99 one-time` (see section 2: this is text only).
   - **Launch URL / Demo URL / Video ID**: leave empty if you have none.
   - **Delivery status**: **Draft** (hidden from the catalog), **Coming soon** (listed, no price, no buy button) or **Live**.
   - **Features**: one per line. **FAQ**: click **Add question** for each question and answer.
   - **WooCommerce product ID** (administrators only): the number of the WooCommerce product that is charged (section 2).
5. Click **Publish** (top right). To hide an app later: set **Delivery status** to **Draft**, or move it to Trash, then **Update**.
6. Open the app page and check it. The **Buy** button appears only when all of these are true: the app is Published, status is **Live**, it is linked to a published WooCommerce product, and at least one version file is attached (section 4). If the button says "Coming soon", one of those is missing.

The app page never shows a download link. Only a signed-in buyer gets the file.

**First time on a new live site:** the ClipForge listing is created from ClipForge's README text by a one-time command (`wp ideatoapps seed-clipforge`, needs SSH/WP-CLI, availability on Bluehost unknown). Without it, create the app by hand with the steps above and create its product as in section 2.

## 2. Change the price

There are **two** places, and they must match:

1. **What is charged:** **Products** (WooCommerce) > open ClipForge > **Regular price** > **Update**. This is the only number used at checkout. The structured data (search engines) follows this price too.
2. **What visitors read:** the app's **Price label** in **Product details** (for example `$29.99 one-time`) > **Update**.
3. Also edit the sentences that mention the old price in the draft **Terms** page and the **FAQ** page. The FAQ answer "What does it cost?" and the Terms line are fixed text in the theme: they need a developer to change, or replace the Terms page text in the editor with your own text.

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

Notes: a version's file can be set only by an administrator or the person who uploaded it. Avoid **Remove** on a version someone already owns; add a newer one instead. The zip is stored in a protected folder the moment you save; the public media library address of the zip must not be shared.

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

- **Settings > IdeaToApps**: **Featured apps** on the home page (leave empty to show the latest), **YouTube channel URL**, **Contact form** on/off (keep off until a mailbox exists).
- **Newsletter sign-ups**: **Tools > Newsletter list** downloads a CSV. Do not mail it (see the safety rules).
- **Pages**: About, FAQ, Contact, Blog, Privacy, Terms and Refund policy are under **Pages**. The three legal pages always show a DRAFT notice; that notice is part of the theme and needs a developer to remove once the text is reviewed.
- **Blog posts**: **Posts > Add New**.
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
