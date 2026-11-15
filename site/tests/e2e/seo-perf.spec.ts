import { gzipSync } from 'node:zlib';
import { test, expect, type Page } from '@playwright/test';
import { adminApi, createApp, createPost, createVideo, createWooProduct, resetContent, uploadImage, uploadZip, type Api } from './helpers/wp';

// Security headers, payload budget, image/font loading and third-party requests.
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const BUDGET = 250 * 1024; // HTML + CSS + JS of the home page.
let api: Api;
test.beforeAll(async () => {
  test.setTimeout(300_000); // seeding goes through the real admin forms and REST on a slow dev server
  api = await adminApi();
  await resetContent(api);
  const product = await createWooProduct(api, 'ClipForge', '24.99');
  const zip = await uploadZip(api, '1.0.0');
  const shot = await uploadImage(api, 'shot.png');
  await createApp(api, { title: 'ClipForge', price: '$24.99 one-time', tagline: 'Edit videos in your browser.', media: shot, wooProductId: product, version: { version: '1.0.0', changelog: 'First.', attachment: zip } });
  await createPost(api, 'Perf post');
  await createVideo(api, 'Perf video', { youtubeId: 'abcdefghijk', media: shot });
});
test.afterAll(async () => { await resetContent(api); });

test('PHP sends the safe security headers on pages and never HSTS or a CSP', async ({ request }) => {
  for (const path of ['/', '/apps/', '/my-account/']) {
    const h = (await request.get(path)).headers();
    expect(h['x-content-type-options'], path).toBe('nosniff');
    expect(h['referrer-policy'], path).toBe('strict-origin-when-cross-origin');
    expect(h['x-frame-options'], path).toBe('SAMEORIGIN');
    expect(h['strict-transport-security'], path).toBeUndefined();
  }
});

/** Collect what the browser loaded for a page: every response with its decoded size and a gzip estimate. */
async function load(page: Page, path: string) {
  const got: Array<{ url: string; type: string; raw: number; gzip: number; encoding: string }> = [];
  const hosts = new Set<string>();
  page.on('request', (r) => { const u = new URL(r.url()); if (/^https?:$/.test(u.protocol)) hosts.add(u.host); }); // data: and blob: URLs are not network requests
  page.on('response', async (res) => {
    const type = res.request().resourceType();
    if (!['document', 'stylesheet', 'script'].includes(type)) return;
    const body = await res.body().catch(() => Buffer.alloc(0));
    got.push({ url: res.url(), type, raw: body.length, gzip: gzipSync(body).length, encoding: res.headers()['content-encoding'] ?? 'identity' });
  });
  await page.goto(path, { waitUntil: 'networkidle' });
  return { got, hosts };
}

test('home HTML + CSS + JS stay under 250 kB (measured on decoded bodies; a gzip estimate is reported too)', async ({ page }, info) => {
  const { got } = await load(page, '/');
  const rawTotal = got.reduce((n, g) => n + g.raw, 0);
  const gzTotal = got.reduce((n, g) => n + g.gzip, 0);
  const encoded = got.some((g) => g.encoding !== 'identity');
  const summary = `home HTML+CSS+JS: raw ${(rawTotal / 1024).toFixed(1)} kB, gzip estimate ${(gzTotal / 1024).toFixed(1)} kB, server compressed: ${encoded}; ${got.length} files`;
  info.annotations.push({ type: 'payload', description: summary });
  console.log(summary);
  // Raw (uncompressed) is the strict, honest bound: the dev server does not compress, a production server will send less.
  expect(rawTotal, summary).toBeLessThan(BUDGET);
  expect(gzTotal).toBeLessThan(rawTotal);
});

for (const path of ['/', '/apps/', '/apps/clipforge/', '/learn/', '/blog/', '/about/']) {
  test(`no third-party requests on ${path}`, async ({ page }) => {
    const { hosts } = await load(page, path);
    expect([...hosts].filter((h) => h !== new URL(page.url()).host), path).toEqual([]);
  });
}

for (const path of ['/', '/apps/', '/apps/clipforge/', '/learn/', '/blog/']) {
  test(`content images are lazy with width and height on ${path} (the header/footer logo and the app hero are above the fold)`, async ({ page }) => {
    await page.goto(path);
    const imgs = await page.locator('img').evaluateAll((els) =>
      els.map((e) => ({ cls: e.className, src: (e as HTMLImageElement).currentSrc, lazy: e.getAttribute('loading'), w: e.getAttribute('width'), h: e.getAttribute('height'), inHero: !!e.closest('.app-hero') })));
    for (const i of imgs) {
      expect(Number(i.w) > 0 && Number(i.h) > 0, `${i.src} width/height`).toBe(true);
      if (!/brand-mark/.test(i.cls) && !i.inHero) expect(i.lazy, `${i.src} loading`).toBe('lazy');
    }
    if (path === '/') expect(imgs.some((i) => !/brand-mark/.test(i.cls)), 'home has a content image to check').toBe(true);
  });
}

test('the font is preloaded with crossorigin and declared font-display: swap', async ({ page }) => {
  await page.goto('/');
  const pre = await page.locator('link[rel="preload"][as="font"]').evaluateAll((els) => els.map((e) => ({ href: (e as HTMLLinkElement).href, type: e.getAttribute('type'), co: e.hasAttribute('crossorigin') })));
  expect(pre).toHaveLength(1);
  expect(pre[0]).toMatchObject({ type: 'font/woff2', co: true });
  const fontCss = await (await page.request.get(await page.locator('link[rel="stylesheet"][href*="fonts.css"]').getAttribute('href') as string)).text();
  expect(fontCss).toMatch(/font-display:\s*swap/);
});

test('the emoji detection script is not loaded', async ({ page }) => {
  const { got } = await load(page, '/');
  expect(got.filter((g) => /emoji/.test(g.url))).toEqual([]);
  expect(await page.locator('#wp-emoji-styles-inline-css, script#wp-emoji-settings').count()).toBe(0);
});

test('no render-blocking script in the head (every script is deferred or inline)', async ({ page }) => {
  await page.goto('/');
  const blocking = await page.locator('head script[src]:not([defer]):not([async]):not([type="module"])').count();
  expect(blocking).toBe(0);
});
