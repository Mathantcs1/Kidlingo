import { test, expect, type Browser, type Page } from '@playwright/test';
import { axeProblems } from './helpers/a11y';
import { horizontalOverflow } from './helpers/layout';
import { base, emailOf, registerAt } from './helpers/buyer';
import { adminApi, createApp, createVideo, createWooProduct, resetContent, saveSettings, send, uploadImage, uploadZip, type Api } from './helpers/wp';

// axe: zero serious/critical violations (and no unexplained "incomplete" contrast results) on every key page,
// in both themes at 360 and 1440 px wide. Each page also must not scroll sideways.
test.describe.configure({ mode: 'serial' });

const slow = expect.configure({ timeout: 30_000 });
const COMBOS = (['dark', 'light'] as const).flatMap((theme) => ([360, 1440] as const).map((width) => ({ theme, width })));
type Combo = (typeof COMBOS)[number];

let api: Api;
let productId = 0;
let buyerState: Awaited<ReturnType<Awaited<ReturnType<typeof registerAt>>['ctx']['storageState']>>;

test.beforeAll(async ({ browser }) => {
  test.setTimeout(480_000);
  api = await adminApi();
  await resetContent(api);
  productId = await createWooProduct(api, 'ClipForge', '24.99');
  const zip = await uploadZip(api, '1.0.0');
  const shot = await uploadImage(api, 'shot.png');
  await createApp(api, { title: 'ClipForge', price: '$24.99 one-time', tagline: 'Edit videos in your browser. Your files stay on your device.', platforms: 'Chromium-based desktop browser', features: ['Timeline editing', 'MP4 export'], faq: [{ q: 'Is it free?', a: 'No, it is a one-time purchase.' }], media: shot, wooProductId: productId, version: { version: '1.0.0', changelog: 'First release.', attachment: zip } });
  const { ctx } = await registerAt(browser, 'a11y');
  buyerState = await ctx.storageState();
  await ctx.close();
});
test.afterAll(async () => { await resetContent(api); });

async function session(browser: Browser, { theme, width }: Combo, state?: typeof buyerState) {
  const ctx = await browser.newContext({ baseURL: base, viewport: { width, height: 900 }, colorScheme: theme, ...(state ? { storageState: state } : {}) });
  await ctx.addInitScript((t) => { try { localStorage.setItem('ideatoapps-theme', t); } catch { /* storage blocked: the page falls back to the OS setting */ } }, theme);
  return { ctx, page: await ctx.newPage() };
}

async function audit(page: Page, label: string, combo: Combo, path?: string) {
  if (path) await page.goto(path);
  await expect(page.locator('html')).toHaveAttribute('data-theme', combo.theme);
  await page.waitForLoadState('networkidle');
  slow(await axeProblems(page), `${label} ${combo.theme} ${combo.width}`).toEqual([]);
  slow(await horizontalOverflow(page), `${label} overflow ${combo.theme} ${combo.width}`).toBeLessThanOrEqual(0);
}

test('learn without videos (empty state) and contact while the form is off', async ({ browser }) => {
  test.setTimeout(240_000);
  for (const combo of COMBOS) {
    const { ctx, page } = await session(browser, combo);
    await audit(page, 'learn (empty)', combo, '/learn/');
    await expect(page.getByTestId('learn-empty')).toBeVisible();
    await audit(page, 'contact (form off)', combo, '/contact/');
    await ctx.close();
  }
});

test('learn with a video, home and contact with the form on', async ({ browser }) => {
  test.setTimeout(360_000);
  const shot = await uploadImage(api, 'video-thumb.png');
  await createVideo(api, 'ClipForge walkthrough', { youtubeId: 'abcdefghijk', media: shot, excerpt: 'A tour of the editor.' });
  await saveSettings(api, { contact: true });
  for (const combo of COMBOS) {
    const { ctx, page } = await session(browser, combo);
    await audit(page, 'learn (video)', combo, '/learn/');
    await expect(page.getByTestId('learn').locator('article')).not.toHaveCount(0);
    await audit(page, 'home', combo, '/');
    await audit(page, 'contact (form on)', combo, '/contact/');
    await ctx.close();
  }
});

test('apps, app detail, login, 404, cart and checkout', async ({ browser }) => {
  test.setTimeout(480_000);
  for (const combo of COMBOS) {
    const { ctx, page } = await session(browser, combo);
    await audit(page, 'apps', combo, '/apps/');
    await audit(page, 'app detail', combo, '/apps/clipforge/');
    await audit(page, 'login', combo, '/my-account/');
    const missing = await page.goto('/this-page-does-not-exist/');
    expect(missing?.status()).toBe(404);
    await audit(page, '404', combo);
    await audit(page, 'cart (empty)', combo, '/cart/');
    await page.goto('/apps/clipforge/');
    await page.getByRole('link', { name: 'Buy ClipForge, $24.99 one-time' }).click();
    await slow(page).toHaveURL(/\/checkout\/?/);
    await slow(page.locator('#place_order')).toBeVisible();
    await slow(page.locator('.blockUI')).toHaveCount(0); // WooCommerce's refresh overlay is translucent: axe cannot rate text under it
    await audit(page, 'checkout', combo);
    await audit(page, 'cart (with ClipForge)', combo, '/cart/');
    await ctx.close();
  }
});

test('library, logged in: empty and with a purchase', async ({ browser }) => {
  test.setTimeout(360_000);
  for (const combo of COMBOS.filter((c) => c.width === 360 || c.theme === 'dark')) {
    const { ctx, page } = await session(browser, combo, buyerState);
    await audit(page, 'library (empty)', combo, '/my-account/downloads/');
    await slow(page.getByTestId('library-empty')).toBeVisible();
    await ctx.close();
  }
  const customers: Array<{ id: number }> = await send(api, 'GET', '/wc/v3/customers', undefined, `email=${encodeURIComponent(emailOf('a11y'))}`);
  expect(customers).toHaveLength(1);
  await send(api, 'POST', '/wc/v3/orders', { customer_id: customers[0].id, status: 'completed', set_paid: true, billing: { first_name: 'Ada', last_name: 'Buyer', email: emailOf('a11y') }, line_items: [{ product_id: productId, quantity: 1 }] });
  for (const combo of COMBOS) {
    const { ctx, page } = await session(browser, combo, buyerState);
    await audit(page, 'library (purchased)', combo, '/my-account/downloads/');
    await slow(page.getByTestId('library').getByTestId('library-version')).toHaveCount(1);
    await ctx.close();
  }
});
