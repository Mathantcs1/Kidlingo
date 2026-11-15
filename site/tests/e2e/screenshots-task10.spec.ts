import { test, expect, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { registerAt, emailOf } from './helpers/buyer';
import { addVersion, adminApi, createApp, createWooProduct, resetContent, send, uploadImage, uploadZip, type Api } from './helpers/wp';

// Handoff screenshots (docs/screenshots/task-10): home, apps, ClipForge page, library (the admin version upload box is not captured, see below),
// at 1440 and 390 px. Not a behaviour test: skipped unless SCREENSHOTS=1.
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate docs/screenshots/task-10');
test.describe.configure({ mode: 'serial' });
test.setTimeout(300_000);

const out = 'docs/screenshots/task-10';
const SIZES = [[1440, 900], [390, 844]] as const;
let api: Api;
let appId = 0;

test.beforeAll(async () => {
  test.setTimeout(300_000);
  api = await adminApi();
  await resetContent(api);
  mkdirSync(out, { recursive: true });
  const product = await createWooProduct(api, 'ClipForge', '24.99');
  const shot = await uploadImage(api, 'shot.png');
  const input = { title: 'ClipForge', price: '$24.99 one-time', tagline: 'Edit videos in your browser. Your files stay on your device.', platforms: 'Chromium-based desktop browser', features: ['Timeline editing', 'MP4 export'], media: shot, wooProductId: product };
  appId = await createApp(api, { ...input, version: { version: '1.0.0', changelog: 'First release.', attachment: await uploadZip(api, '1.0.0') } });
  await addVersion(api, appId, input, { version: '1.1.0', changelog: 'Example second release (sandbox data).', attachment: await uploadZip(api, '1.1.0') });
});
test.afterAll(async () => { await resetContent(api); });

async function shoot(page: Page, name: string, locator?: string) {
  for (const scheme of ['dark', 'light'] as const) {
    for (const [width, height] of SIZES) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      await page.evaluate((t) => { try { localStorage.setItem('ideatoapps-theme', t); } catch { /* ignore */ } }, scheme);
      await page.reload();
      await page.evaluate(() => document.fonts.ready);
      const path = `${out}/${name}-${scheme}-${width}.png`;
      if (locator) await page.locator(locator).first().screenshot({ path });
      else await page.screenshot({ path, fullPage: true });
    }
  }
}

test('public pages: home, apps, ClipForge page', async ({ page }) => {
  for (const [path, name] of [['/', 'home'], ['/apps/', 'apps'], ['/apps/clipforge/', 'clipforge']] as const) {
    await page.goto(path);
    await shoot(page, name);
  }
});

test('library for a buyer with 1.0.0 and 1.1.0', async ({ browser }) => {
  const { ctx, page } = await registerAt(browser, 'shots');
  const customers: Array<{ id: number }> = await send(api, 'GET', '/wc/v3/customers', undefined, `email=${encodeURIComponent(emailOf('shots'))}`);
  const products: Array<{ id: number }> = await send(api, 'GET', '/wc/v3/products', undefined, 'per_page=5');
  const order = await send(api, 'POST', '/wc/v3/orders', { customer_id: customers[0].id, status: 'pending', line_items: [{ product_id: products[0].id, quantity: 1 }] });
  await send(api, 'PUT', `/wc/v3/orders/${order.id}`, { status: 'completed' });
  await page.goto('/my-account/downloads/');
  await expect(page.getByTestId('library').getByTestId('library-version').first()).toBeVisible({ timeout: 30_000 });
  await shoot(page, 'library');
  await ctx.close();
});

// The admin Versions box (Apps > ClipForge > Versions) is not captured here: in the block editor it sits in a collapsed
// "Meta Boxes" panel that stayed hidden under automation in the sandbox (see the Task 10 report). ADMIN_GUIDE.md describes it in words.
