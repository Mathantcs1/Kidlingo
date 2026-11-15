import { test, expect } from '@playwright/test';
import { adminApi, createApp, createWooProduct, resetContent, send, uploadZip, type Api } from './helpers/wp';

const slow = expect.configure({ timeout: 30_000 });
test.setTimeout(120_000);

let api: Api;
test.beforeAll(async () => { api = await adminApi(); await resetContent(api); });
test.afterAll(async () => { await resetContent(api); });

test.describe('the buy gate', () => {
  test('a live app with a product but no zip yet says Coming soon and cannot be bought, even with a crafted add-to-cart URL', async ({ page }) => {
    const product = await createWooProduct(api, 'Gate App');
    await createApp(api, { title: 'Gate App', price: '$24.99 one-time', tagline: 'Not ready yet.', wooProductId: product });
    await page.goto('/apps/gate-app/');
    await slow(page.getByTestId('buy-area')).toContainText('Coming soon');
    await slow(page.locator('a[href*="add-to-cart"]')).toHaveCount(0);
    await slow(page.getByRole('link', { name: /^Buy/ })).toHaveCount(0);
    await page.goto('/apps/');
    await slow(page.locator('.card').filter({ has: page.locator('a[href$="/apps/gate-app/"]') })).toContainText('Coming soon');
    await page.goto(`/?add-to-cart=${product}`); // someone who guesses the URL
    await page.goto('/cart/');
    await slow(page.locator('.cart_item')).toHaveCount(0);
  });

  test('the price on the Buy button and the card is the WooCommerce price, whatever the text label says', async ({ page }) => {
    const product = await createWooProduct(api, 'Price App', '24.99');
    await createApp(api, { title: 'Price App', price: '$1.00 stale label', tagline: 'Priced.', wooProductId: product, version: { version: '1.0.0', changelog: 'First.', attachment: await uploadZip(api, '1.0.0') } });
    await page.goto('/apps/price-app/');
    await slow(page.getByTestId('buy-area').getByRole('link', { name: 'Buy Price App, $24.99 one-time' })).toBeVisible();
    await send(api, 'PUT', `/wc/v3/products/${product}`, { regular_price: '31.50' });
    await page.goto('/apps/price-app/');
    await slow(page.getByTestId('buy-area').getByRole('link', { name: 'Buy Price App, $31.50 one-time' })).toBeVisible();
    await page.goto('/apps/');
    await slow(page.locator('.card').filter({ has: page.locator('a[href$="/apps/price-app/"]') })).toContainText('$31.50 one-time');
    await expect(page.locator('body')).not.toContainText('stale label');
  });

  test('a release zip is private from the moment it is uploaded: the public media list never shows it', async () => {
    const id = await uploadZip(api, '9.9.9'); // uploaded, never saved to a version
    const res = await fetch(new URL('/wp-json/wp/v2/media?mime_type=application/zip&per_page=100', `http://localhost:${process.env.WP_PORT ?? '8888'}`).toString());
    expect(res.status).toBe(200);
    const listed = (await res.json()) as { id: number; source_url: string }[];
    expect(listed.map((m) => m.id)).not.toContain(id);
    expect(JSON.stringify(listed)).not.toContain('ClipForge-9.9.9');
    const all = await (await fetch(new URL('/wp-json/wp/v2/media?per_page=100', `http://localhost:${process.env.WP_PORT ?? '8888'}`))).json();
    expect(JSON.stringify(all)).not.toContain('ClipForge-9.9.9');
  });
});
