import { test, expect } from '@playwright/test';
import { adminApi, createApp, createWooProduct, resetContent, type Api } from './helpers/wp';

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
});

