import { test, expect, request as pwRequest, type Browser, type BrowserContext, type Page } from '@playwright/test';
import { axeProblems } from './helpers/a11y';
import { horizontalOverflow } from './helpers/layout';
import { bytesOf, registerAt, base } from './helpers/buyer';
import { addVersion, adminApi, createApp, createWooProduct, enableOfflineGateway, resetContent, send, uploadZip, type Api, type AppInput } from './helpers/wp';

/**
 * Purchase flow end to end with WooCommerce's offline gateway (Cash on delivery) standing in for Stripe: there are no Stripe
 * test keys here. Real accounts, real orders, real signed download links, real zip bytes.
 */
// The Playground dev server answers slowly (checkout, login redirects), so every assertion here waits up to 30 s.
const slow = expect.configure({ timeout: 30_000 });
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let api: Api;
let productId = 0;
let rawZipUrl = '';
let aState: Awaited<ReturnType<BrowserContext['storageState']>>;
let bState: Awaited<ReturnType<BrowserContext['storageState']>>;
let aLink = '';
let appInput: AppInput;
let appId = 0;

test.beforeAll(async () => {
  api = await adminApi();
  await resetContent(api);
  await enableOfflineGateway(api);
  productId = await createWooProduct(api, 'ClipForge');
  appInput = { title: 'ClipForge', price: '$24.99 one-time', tagline: 'Edit videos in your browser. Your files stay on your device.', wooProductId: productId };
  appId = await createApp(api, { ...appInput, version: { version: '1.0.0', changelog: 'First release.', attachment: await uploadZip(api, '1.0.0') } });
});
test.afterAll(async () => { await resetContent(api); });

test.describe('buying ClipForge', () => {
  test('the Buy button leads to checkout, which requires an account (no guest checkout)', async ({ page }) => {
    await page.goto('/apps/clipforge/');
    await page.getByRole('link', { name: 'Buy ClipForge, $24.99 one-time' }).click();
    await slow(page).toHaveURL(/\/checkout\/?/);
    await slow(page.locator('#account_password')).toBeVisible(); // account creation is required, the password is chosen here
    await slow(page.locator('#createaccount')).toHaveCount(0); // no "create an account?" opt-out checkbox: guests cannot buy
    await slow(page.locator('#billing_phone, #billing_address_1')).toHaveCount(0); // a download needs no postal address
    await slow(page.locator('.cart_item')).toContainText('ClipForge');
    await slow(page.locator('.order-total .amount')).toHaveText('$24.99');
    await slow(page.locator('.cart_item .quantity, .cart_item input.qty')).toHaveCount(0); // sold individually
  });

  test('register, buy with the offline gateway, see 1.0.0 in the library and download a real zip', async ({ browser }) => {
    const { ctx, page } = await registerAt(browser, 'a');
    await page.goto('/apps/clipforge/');
    await page.getByRole('link', { name: 'Buy ClipForge, $24.99 one-time' }).click();
    await slow(page).toHaveURL(/\/checkout\/?/);
    await page.locator('#billing_first_name').fill('Ada');
    await page.locator('#billing_last_name').fill('Buyer');
    await page.locator('#payment_method_cod').check();
    await page.locator('#place_order').click();
    await slow(page).toHaveURL(/order-received/, { timeout: 60_000 });
    await slow(page.locator('body')).toContainText('Your order has been received');

    // Cash on delivery leaves a downloadable order on hold (unpaid): no access yet. That is the same state a Stripe order is in
    // until the payment webhook marks it paid, so marking it processing/completed below stands in for that webhook.
    await page.goto('/my-account/downloads/');
    await slow(page.getByTestId('library-empty')).toContainText('No purchases yet');
    const orders: Array<{ id: number; status: string }> = await send(api, 'GET', '/wc/v3/orders', undefined, 'per_page=10');
    slow(orders).toHaveLength(1);
    slow(orders[0].status).toBe('on-hold');
    await send(api, 'PUT', `/wc/v3/orders/${orders[0].id}`, { status: 'completed' });

    await page.goto('/my-account/downloads/');
    const library = page.getByTestId('library');
    await slow(library.getByTestId('library-version')).toHaveCount(1);
    await slow(library.getByTestId('library-version')).toContainText('Version 1.0.0');
    await slow(library.getByTestId('library-version')).toContainText('First release.');
    const button = library.getByTestId('download-button');
    aLink = (await button.getAttribute('href')) ?? '';
    slow(aLink).toMatch(/download_file=\d+/);
    slow(aLink).not.toMatch(/woocommerce_uploads|\.zip/); // the link is signed, not the file's address

    const res = await ctx.request.get(aLink);
    slow(res.status()).toBe(200);
    const body = await bytesOf(res);
    slow(body.slice(0, 2)).toBe('PK');
    slow(body).toContain('ClipForge 1.0.0'); // the right version's bytes
    slow(res.headers()['content-disposition'] ?? '').toContain('ClipForge-1.0.0.zip');

    aState = await ctx.storageState();
    await ctx.close();
  });

  test('an anonymous GET of the raw zip path is 403 or 404', async () => {
    const product = await send(api, 'GET', `/wc/v3/products/${productId}`);
    rawZipUrl = product.downloads[0].file; // what only the admin can see: the file's real address
    slow(rawZipUrl).toContain('woocommerce_uploads');
    slow(rawZipUrl).toMatch(/\/ideatoapps\/[0-9a-f]{12}\/ClipForge-1\.0\.0.*\.zip$/); // unguessable folder, never listed anywhere
    const anon = await pwRequest.newContext();
    // Apache/LiteSpeed (Bluehost) enforce woocommerce_uploads/.htaccess ("deny from all"). The Playground dev server serves
    // static files and ignores .htaccess, which WooCommerce's own index.html in that folder reveals: skip there, loudly.
    const probe = await anon.get(new URL('index.html', rawZipUrl.replace(/ideatoapps\/.*$/, '')).toString());
    test.skip(probe.status() === 200, 'SANDBOX LIMITATION: this server ignores .htaccess (woocommerce_uploads/index.html is publicly readable), so raw-path denial cannot be verified here. Verify on the real host.');
    const res = await anon.get(rawZipUrl, { maxRedirects: 0 });
    slow([403, 404]).toContain(res.status());
    slow((await bytesOf(res)).slice(0, 2)).not.toBe('PK');
    const a = await pwRequest.newContext({ storageState: aState }); // even the buyer cannot use the raw path
    slow([403, 404]).toContain((await a.get(rawZipUrl, { maxRedirects: 0 })).status());
    await anon.dispose();
    await a.dispose();
  });

  test('nothing public exposes the zip: app page, REST media list, site search', async () => {
    const anon = await pwRequest.newContext({ baseURL: base });
    const html = await (await anon.get('/apps/clipforge/')).text();
    slow(html).not.toMatch(/\.zip|woocommerce_uploads|download_file=/i);
    const media = await anon.get('/?rest_route=/wp/v2/media&per_page=100');
    slow(await media.text()).not.toMatch(/ClipForge-1\.0\.0|woocommerce_uploads|\.zip/i);
    const search = await anon.get('/?s=ClipForge&post_type=attachment'); // the site search must not list the private zip attachment
    slow(await search.text()).not.toMatch(/woocommerce_uploads|\.zip|download_file=/i);
    await anon.dispose();
  });

  test('a second user cannot fetch the first user’s download link, and an anonymous visitor cannot either', async ({ browser }) => {
    const { ctx, page } = await registerAt(browser, 'b');
    const res = await ctx.request.get(aLink, { maxRedirects: 0 });
    slow(res.status()).not.toBe(200);
    slow((await bytesOf(res)).slice(0, 2)).not.toBe('PK');
    const followed = await ctx.request.get(aLink);
    slow(followed.headers()['content-type'] ?? '').not.toContain('zip');
    slow((await bytesOf(followed)).slice(0, 2)).not.toBe('PK');
    const anon = await pwRequest.newContext();
    const anonRes = await anon.get(aLink);
    slow((await bytesOf(anonRes)).slice(0, 2)).not.toBe('PK');
    await anon.dispose();

    await page.goto('/my-account/downloads/'); // B bought nothing
    await slow(page.getByTestId('library-empty')).toContainText('No purchases yet');
    await slow(page.getByTestId('library-version')).toHaveCount(0);
    bState = await ctx.storageState();
    await ctx.close();
  });

  test('uploading 1.1.0 later makes it appear for the first buyer with no action', async ({ browser }) => {
    await addVersion(api, appId, appInput, { version: '1.1.0', changelog: 'Fixes and polish.', attachment: await uploadZip(api, '1.1.0') });
    const ctx = await browser.newContext({ baseURL: base, storageState: aState });
    const page = await ctx.newPage();
    await page.goto('/my-account/downloads/');
    const versions = page.getByTestId('library-version');
    await slow(versions).toHaveCount(2);
    await slow(versions.nth(0)).toContainText('Version 1.1.0');
    await slow(versions.nth(0)).toContainText('Fixes and polish.');
    await slow(versions.nth(1)).toContainText('Version 1.0.0');
    const res = await ctx.request.get((await versions.nth(0).getByTestId('download-button').getAttribute('href')) ?? '');
    slow(res.status()).toBe(200);
    const body = await bytesOf(res);
    slow(body.slice(0, 2)).toBe('PK');
    slow(body).toContain('ClipForge 1.1.0');
    await ctx.close();
  });

  test('the populated library is accessible and fits 360px in both themes', async ({ browser }) => {
    for (const theme of ['dark', 'light'] as const) {
      for (const width of [360, 1440]) {
        const { ctx, page } = await setLibraryState(browser, theme, aState, width);
        await page.goto('/my-account/downloads/');
        await slow(page.getByTestId('library-version')).toHaveCount(2);
        slow(await axeProblems(page), `library ${theme} ${width}`).toEqual([]);
        slow(await horizontalOverflow(page), `library overflow ${theme} ${width}`).toBeLessThanOrEqual(0);
        await ctx.close();
      }
    }
  });

  test('a user who bought nothing does not get 1.1.0 either', async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: base, storageState: bState });
    const page = await ctx.newPage();
    await page.goto('/my-account/downloads/');
    await slow(page.getByTestId('library-empty')).toBeVisible();
    await ctx.close();
  });
});

async function setLibraryState(browser: Browser, theme: 'dark' | 'light', state: typeof aState, width: number): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL: base, storageState: state, colorScheme: theme, viewport: { width, height: 900 } });
  return { ctx, page: await ctx.newPage() };
}

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme: library, cart and checkout are accessible and fit 360px`, () => {
    test('empty library, cart, checkout (360 and 1440)', async ({ browser }) => {
      for (const width of [360, 1440]) {
        const { ctx, page } = await setLibraryState(browser, theme, bState, width);
        await page.goto('/my-account/downloads/');
        await slow(page.getByTestId('library-empty')).toBeVisible();
        slow(await axeProblems(page), `empty library ${width}`).toEqual([]);
        slow(await horizontalOverflow(page), `empty library overflow ${width}`).toBeLessThanOrEqual(0);

        await page.goto('/apps/clipforge/');
        await page.getByRole('link', { name: 'Buy ClipForge, $24.99 one-time' }).click(); // on later passes the app is already in the cart: Buy still lands on checkout
        await slow(page).toHaveURL(/\/checkout\/?/);
        await slow(page.locator('#place_order')).toBeVisible();
        await slow(page.locator('.blockUI')).toHaveCount(0); // WooCommerce's refresh overlay is translucent: axe cannot rate text under it
        await page.waitForLoadState('networkidle'); // checkout fires update_order_review after load; let it finish before measuring
        slow(await axeProblems(page), `checkout ${width}`).toEqual([]);
        slow(await horizontalOverflow(page), `checkout overflow ${width}`).toBeLessThanOrEqual(0);

        await page.goto('/cart/');
        await slow(page.locator('.cart_item')).toBeVisible();
        slow(await axeProblems(page), `cart ${width}`).toEqual([]);
        slow(await horizontalOverflow(page), `cart overflow ${width}`).toBeLessThanOrEqual(0);
        await ctx.close();
      }
    });
  });
}

test('a refunded order loses its downloads and does not receive later versions', async ({ browser }) => {
  const orders: Array<{ id: number; total: string }> = await send(api, 'GET', '/wc/v3/orders', undefined, 'per_page=10');
  slow(orders.length).toBe(1);
  await send(api, 'POST', `/wc/v3/orders/${orders[0].id}/refunds`, { amount: orders[0].total, api_refund: false });
  await addVersion(api, appId, appInput, { version: '1.2.0', changelog: 'Later.', attachment: await uploadZip(api, '1.2.0') });
  const ctx = await browser.newContext({ baseURL: base, storageState: aState });
  const page = await ctx.newPage();
  await page.goto('/my-account/downloads/');
  await slow(page.getByTestId('library-empty')).toContainText('No purchases yet');
  slow((await bytesOf(await ctx.request.get(aLink))).slice(0, 2)).not.toBe('PK');
  await ctx.close();
});
