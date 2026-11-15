import { test, expect, type Page } from '@playwright/test';
import { axeProblems } from './helpers/a11y';
import { horizontalOverflow } from './helpers/layout';

const setTheme = (page: Page, t: 'light' | 'dark') =>
  page.addInitScript((v) => localStorage.setItem('ideatoapps-theme', v), t);

async function logoOk(page: Page, scope: string) {
  const img = page.locator(`${scope} img.brand-mark`);
  await expect(img).toHaveCount(1);
  await expect(img).toHaveAttribute('width', '40');
  await expect(img).toHaveAttribute('height', '40');
  await expect(img).toHaveAttribute('alt', '');
  await img.scrollIntoViewIfNeeded();
  await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth)).toBeGreaterThan(0);
}

test('header and footer show the logo mark (loaded, sized, decorative)', async ({ page }) => {
  await page.goto('/');
  await logoOk(page, '.site-header');
  await logoOk(page, '.site-footer');
  await expect(page.getByRole('banner').getByRole('link', { name: 'IdeaToApps' })).toBeVisible();
});

test('favicon, apple-touch-icon and theme-color are declared and the files are served', async ({ page, request }) => {
  await page.goto('/');
  const links = await page.locator('head link[rel~="icon"], head link[rel="apple-touch-icon"]').evaluateAll((els) =>
    els.map((e) => ({ rel: (e as HTMLLinkElement).rel, href: (e as HTMLLinkElement).href, sizes: e.getAttribute('sizes') })),
  );
  expect(links.length).toBeGreaterThanOrEqual(3);
  for (const l of links) {
    const res = await request.get(l.href);
    expect(res.status(), l.href).toBe(200);
    expect(res.headers()['content-type'], l.href).toMatch(/^image\/(png|x-icon|vnd\.microsoft\.icon)/);
  }
  const apple = links.find((l) => l.rel === 'apple-touch-icon')!;
  const dims = await page.evaluate(
    (src) => new Promise<[number, number]>((ok, bad) => {
      const i = new Image();
      i.onload = () => ok([i.naturalWidth, i.naturalHeight]);
      i.onerror = () => bad(new Error('apple icon failed'));
      i.src = src;
    }),
    apple.href,
  );
  expect(dims).toEqual([180, 180]);
  await expect(page.locator('head meta[name="theme-color"]').first()).toHaveAttribute('content', /^#[0-9a-fA-F]{6}$/);
});

test('og:image and twitter:image point at an existing 1200x630 file', async ({ page, request }) => {
  await page.goto('/');
  const og = await page.locator('meta[property="og:image"]').getAttribute('content');
  const tw = await page.locator('meta[name="twitter:image"]').getAttribute('content');
  expect(og).toMatch(/^https?:\/\//);
  expect(tw).toBe(og);
  const res = await request.get(og!);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toMatch(/^image\/png/);
  const buf = await res.body();
  expect(buf.readUInt32BE(16)).toBe(1200);
  expect(buf.readUInt32BE(20)).toBe(630);
});

for (const theme of ['light', 'dark'] as const) {
  test(`no horizontal overflow at 360 and axe-clean header (${theme})`, async ({ page }) => {
    await setTheme(page, theme);
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    expect(await axeProblems(page)).toEqual([]);
  });
}

test('skip link stays the first focusable element', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Tab');
  await expect(page.locator(':focus')).toHaveText('Skip to content');
});

// Documentation screenshots: SHOTS=1 npx playwright test brand.spec.ts -g screenshots
test.describe('screenshots', () => {
  test.skip(!process.env.SHOTS, 'set SHOTS=1 to capture docs/screenshots/logo');
  for (const theme of ['light', 'dark'] as const) {
    for (const width of [1440, 360]) {
      test(`header ${theme} ${width}`, async ({ page }) => {
        await setTheme(page, theme);
        await page.setViewportSize({ width, height: 400 });
        await page.goto('/');
        await page.screenshot({ path: `docs/screenshots/logo/header-${theme}-${width}.png`, clip: { x: 0, y: 0, width, height: 100 } });
        await page.locator('.site-footer').screenshot({ path: `docs/screenshots/logo/footer-${theme}-${width}.png` });
      });
    }
  }
});
