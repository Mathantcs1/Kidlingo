import { test, expect, type Page } from '@playwright/test';
import { registerAt } from './helpers/buyer';
import { adminApi, createApp, createWooProduct, resetContent, uploadZip, type Api } from './helpers/wp';

// Guards the Task 9 review finding: the theme defers jQuery for speed, and WooCommerce's cart and checkout scripts
// depend on it. If load order ever breaks, the pages still render but checkout silently dies with
// "jQuery is not defined". So: no page errors, and jQuery really exists, on /cart/ and /checkout/ with an item in the cart.
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let api: Api;
let productId = 0;

test.beforeAll(async () => {
  test.setTimeout(240_000);
  api = await adminApi();
  await resetContent(api);
  productId = await createWooProduct(api, 'ClipForge', '24.99');
  const zip = await uploadZip(api, '1.0.0');
  await createApp(api, { title: 'ClipForge', price: '$24.99 one-time', tagline: 'Edit videos in your browser.', wooProductId: productId, version: { version: '1.0.0', changelog: 'First release.', attachment: zip } });
});
test.afterAll(async () => { await resetContent(api); });

function watch(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`${e.name}: ${e.message}`));
  return errors;
}

async function expectHealthy(page: Page, path: string, errors: string[]) {
  await page.goto(path);
  await page.waitForLoadState('load');
  await expect.poll(() => page.evaluate(() => typeof (window as unknown as { jQuery?: unknown }).jQuery), { message: `${path}: window.jQuery` }).toBe('function');
  expect(errors.filter((e) => /jQuery is not defined|ReferenceError/.test(e)), `${path} page errors`).toEqual([]);
  expect(errors, `${path} page errors`).toEqual([]);
}

test('/cart/ and /checkout/ run without script errors for a signed-in buyer with ClipForge in the cart', async ({ browser }) => {
  const { ctx, page } = await registerAt(browser, 'script-errors');
  const errors = watch(page);
  await page.goto(`/?add-to-cart=${productId}`);
  await expectHealthy(page, '/cart/', errors);
  await expect(page.getByText('ClipForge').first()).toBeVisible();
  await expectHealthy(page, '/checkout/', errors);
  await expect(page.locator('form.checkout, form.woocommerce-checkout').first()).toBeVisible();
  await ctx.close();
});

test('an empty /cart/ also runs without script errors', async ({ page }) => {
  const errors = watch(page);
  await expectHealthy(page, '/cart/', errors);
});
