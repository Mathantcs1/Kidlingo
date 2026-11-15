# Stripe setup (TEST MODE ONLY)

Status: **no Stripe account keys exist in this project and none are committed.** Stripe stays in **test mode** until the
owner explicitly approves live payments. No real card is ever charged by anything described here.

## Plugin choice

Use the official **WooCommerce Stripe Payment Gateway** (plugin slug `woocommerce-gateway-stripe`, published by
WooCommerce/Automattic, free; Stripe charges its own per-transaction fee). It uses Stripe's hosted payment fields, so card
numbers are typed into Stripe's iframe and **never reach this site, its database or its logs**. The site never stores card data.

Install it from Plugins > Add New on the live site (it is not bundled in the repo, because the build sandbox cannot reach
wordpress.org). Cost and fee numbers are recorded in `DECISIONS.md` (Task 10) with unknowns marked.

## Keys (placeholders only)

Never paste real keys into the repo, a ticket, a chat or a screenshot. Enter them only in WooCommerce > Settings > Payments >
Stripe, with **Test mode** ticked:

| Field | Placeholder (what it looks like) | Where it comes from |
| --- | --- | --- |
| Test publishable key | `pk_test_REPLACE_ME` | Stripe dashboard (Test mode) > Developers > API keys |
| Test secret key | `sk_test_REPLACE_ME` | same page |
| Test webhook secret | `whsec_REPLACE_ME` | shown after you create the webhook below |

`.env.example` documents the same placeholders; a real `.env` is git-ignored.

## Webhook

In the Stripe dashboard (Test mode) > Developers > Webhooks > Add endpoint:

- Endpoint URL: `<site-address>/?wc-api=wc_stripe`, where `<site-address>` is the Site Address in Settings > General **right now**.
  - **Phase A** (before DNS points at Bluehost, see `DEPLOYMENT_BLUEHOST.md`): use the temporary URL, for example `https://<random>.temp.domains/?wc-api=wc_stripe`.
  - **Phase B** (after DNS and the switch to the apex): update the endpoint to `https://ideatoapps.net/?wc-api=wc_stripe` (or create a new one and delete the old). The temporary URL stops working once the site address changes, and the signing secret of a new endpoint differs, so paste the new `whsec_...` into the plugin again.
- Events: the ones the plugin lists on its settings page (it also offers a one-click "Configure webhooks" button that
  creates the endpoint with the right events). The plugin handles payment success, payment failure, refunds and disputes.
- Copy the signing secret (`whsec_...`) into the plugin's "Test webhook secret" field.

### A replayed webhook must not create a second order

Orders are created by **WooCommerce at checkout**, before Stripe is called; a webhook only *updates the status of the
existing order* (matched by the order ID stored with the Stripe payment). So replaying an event, or Stripe retrying one,
cannot create another order. On this site's side, access is also safe to repeat: a download permission is created at most
once per order and version (`ideatoapps_grant_new_version` skips orders that already hold it), and
`tests/php/EntitlementsTest.php::test_replayed_payment_notification_does_not_duplicate_order_or_access` replays the
payment-complete / status-completed notifications and asserts one order and one set of permissions.

**Not verified here:** a real Stripe webhook replay (no Stripe keys and no public URL in the sandbox). Check it once in
test mode before going live: Stripe dashboard > Webhooks > the event > Resend, then confirm WooCommerce > Orders still shows
one order.

## Test cards (test mode only)

Any future expiry date, any 3-digit CVC, any postcode. Confirm against Stripe's testing documentation, which is the source of truth.

| Card number | Result |
| --- | --- |
| `4242 4242 4242 4242` | succeeds |
| `4000 0000 0000 0002` | declined |
| `4000 0000 0000 9995` | declined, insufficient funds |
| `4000 0025 0000 3155` | requires 3-D Secure authentication |

## Safeguard in the code: live mode is blocked

`includes/payments-guard.php` hides every Stripe gateway at checkout while Stripe is set to **live** mode, and shows an
admin notice, unless `wp-config.php` contains `define( 'IDEATOAPPS_ALLOW_LIVE_PAYMENTS', true );`. Only the owner adds that
line, only after approving live payments. The code never reads, stores or logs keys or card data.

## Browser tests without Stripe

Playwright (`tests/e2e/purchase.spec.ts`) uses WooCommerce's offline **Cash on delivery** gateway as a stand-in. That proves
accounts, orders, signed downloads, versioned access and refunds; it does not prove Stripe's own payment form, 3-D Secure or webhooks.
Turn the offline gateways **off** on the live site (WooCommerce > Settings > Payments).

## Going live (needs the owner's explicit go-ahead)

1. Test-mode run-through with the cards above: success, decline, 3-D Secure, refund from WooCommerce, webhook resend.
2. Legal pages reviewed (they are DRAFT today), tax handling decided, refund policy chosen.
3. Owner confirms a working support mailbox.
4. Stripe Express Checkout (the Apple Pay / Google Pay buttons on product and cart pages) is a separate Stripe plugin feature. Disable it in the test
   setup, or verify it against the live guard before go-live: the guard only hides the gateway at checkout, it does not turn off other Stripe surfaces.
   A Stripe setting with no `testmode` value counts as LIVE (the Stripe plugin does the same).
5. Owner approves; then switch Stripe to live keys and add the `IDEATOAPPS_ALLOW_LIVE_PAYMENTS` line. Make one small real purchase and refund it.
