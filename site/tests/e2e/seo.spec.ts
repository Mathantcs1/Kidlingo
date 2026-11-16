import { test, expect, type Page } from '@playwright/test';
import { adminApi, createApp, createPost, createVideo, createWooProduct, resetContent, saveSettings, send, trash, uploadImage, uploadZip, type Api } from './helpers/wp';

// Public head output: canonical, title, description, Open Graph, robots meta, robots.txt, sitemap and structured data.
// The canonical origin is the constant https://ideatoapps.net, never the host the test runs on.
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const ORIGIN = 'https://ideatoapps.net';
let api: Api;
let videoId = 0;
let postPath = ''; // the site's permalink structure decides it (dated URLs on the dev site)

test.beforeAll(async () => {
  test.setTimeout(300_000); // seeding goes through the real admin forms and REST on a slow dev server
  api = await adminApi();
  await resetContent(api);
  const product = await createWooProduct(api, 'ClipForge', '24.99');
  const zip = await uploadZip(api, '1.0.0');
  const shot = await uploadImage(api, 'clipforge-shot.png');
  await createApp(api, { title: 'ClipForge', price: '$24.99 one-time', tagline: 'Edit videos in your browser. Your files stay on your device.', platforms: 'Chromium-based desktop browser', media: shot, wooProductId: product, version: { version: '1.0.0', changelog: 'First release.', attachment: zip } });
  await createApp(api, { title: 'Hidden Draft', delivery: 'draft' });
  const postId = await createPost(api, 'SEO test post');
  postPath = new URL((await send(api, 'GET', `/wp/v2/posts/${postId}`)).link).pathname;
  videoId = await createVideo(api, 'SEO walkthrough', { youtubeId: 'abcdefghijk', excerpt: 'A walkthrough of the editor.', media: shot });
  await saveSettings(api, { contact: true });
});
test.afterAll(async () => { await resetContent(api); });

const head = (page: Page) =>
  page.evaluate(() => {
    const meta = (sel: string) => document.querySelector(sel)?.getAttribute('content') ?? null;
    return {
      title: document.title,
      canonicals: [...document.querySelectorAll('link[rel="canonical"]')].map((l) => l.getAttribute('href')),
      description: meta('meta[name="description"]'),
      og: Object.fromEntries(['title', 'description', 'url', 'image', 'type', 'site_name'].map((k) => [k, meta(`meta[property="og:${k}"]`)])),
      twitterCard: meta('meta[name="twitter:card"]'),
      twitterImage: meta('meta[name="twitter:image"]'),
      robots: meta('meta[name="robots"]') ?? '',
    };
  });

const publicPaths = () => ['/', '/apps/', '/apps/clipforge/', '/learn/', '/learn/seo-walkthrough/', '/blog/', postPath, '/about/', '/faq/', '/contact/', '/privacy/', '/terms/', '/refund-policy/'];

test('every public page has one apex canonical, a unique title and description, and Open Graph tags', async ({ page }) => {
  const titles = new Map<string, string>();
  const descriptions = new Map<string, string>();
  for (const path of publicPaths()) {
    const res = await page.goto(`${path}?utm_source=test&ref=x`); // tracking parameters must not reach the canonical
    expect(res?.status(), path).toBe(200);
    const h = await head(page);
    expect(h.canonicals, `${path} canonical count`).toHaveLength(1);
    expect(h.canonicals[0], path).toBe(ORIGIN + path);
    expect(h.og.url, path).toBe(ORIGIN + path);
    expect(h.robots, path).not.toMatch(/noindex/);
    expect(h.title.trim(), path).not.toBe('');
    expect(h.title, path).toMatch(/IdeaToApps/);
    expect(titles.get(h.title), `title of ${path} duplicates ${titles.get(h.title)}`).toBeUndefined();
    titles.set(h.title, path);
    expect(h.description, `${path} description`).toBeTruthy();
    expect(h.description!.length, path).toBeLessThanOrEqual(170);
    expect(descriptions.get(h.description!), `description of ${path} duplicates ${descriptions.get(h.description!)}`).toBeUndefined();
    descriptions.set(h.description!, path);
    expect(h.og.title, path).toBe(h.title);
    expect(h.og.description, path).toBe(h.description);
    expect(h.og.site_name, path).toBe('IdeaToApps');
    expect(h.og.image, `${path} og:image`).toMatch(/^https?:\/\//);
    expect(h.twitterCard, path).toBe('summary_large_image');
    expect(h.twitterImage, path).toBe(h.og.image);
  }
});

test('the app page uses its own featured image for og:image; other pages use the logo card', async ({ page }) => {
  await page.goto('/apps/clipforge/');
  expect((await head(page)).og.image).toMatch(/\/wp-content\/uploads\/.*clipforge-shot/);
  await page.goto('/about/');
  expect((await head(page)).og.image).toMatch(/assets\/img\/og-default\.png$/);
});

test('blog paging is the one query string a canonical keeps', async ({ page }) => {
  test.setTimeout(180_000);
  // Page 2 must really exist (a page past the end redirects to the last page), so the blog needs more than twelve posts (one is the shared post).
  const extra: number[] = [];
  try {
    for (let i = 1; i <= 12; i++) extra.push(await createPost(api, `Paging post ${i}`, { date: `2026-04-${String(i).padStart(2, '0')}T10:00:00` }));
    await page.goto('/blog/?pg=2&utm_medium=x');
    expect((await head(page)).canonicals).toEqual([`${ORIGIN}/blog/?pg=2`]);
  } finally {
    for (const id of extra) await trash(api, 'posts', id);
  }
});

const NOINDEX: Array<[string, number]> = [
  ['/my-account/', 200], ['/cart/', 200], ['/checkout/', 200], ['/wp-login.php', 200], ['/?s=clipforge', 200], ['/this-page-does-not-exist/', 404],
  ['/product/clipforge/', 200], ['/shop/', 200], ['/category/uncategorized/', 200], ['/apps/?category=no-such-category', 200],
];

for (const [path, status] of NOINDEX) {
  test(`noindex,follow: ${path}`, async ({ page }) => {
    const res = await page.goto(path);
    expect(res?.status(), path).toBe(status);
    const h = await head(page);
    expect(h.robots, path).toMatch(/noindex/);
    if (path !== '/wp-login.php') expect(h.robots, path).toMatch(/follow/); // core's login page says "noindex, noarchive"
    expect(h.canonicals, `${path} declares no canonical`).toHaveLength(0);
  });
}

test('robots.txt points at the apex sitemap and blocks the private areas', async ({ request }) => {
  const res = await request.get('/robots.txt');
  expect(res.status()).toBe(200);
  const txt = await res.text();
  expect(txt).toContain(`Sitemap: ${ORIGIN}/sitemap.xml`);
  for (const rule of ['Disallow: /wp-admin/', 'Allow: /wp-admin/admin-ajax.php', 'Disallow: /my-account/', 'Disallow: /cart/', 'Disallow: /checkout/']) expect(txt, rule).toContain(rule);
  expect(txt).not.toMatch(/^Disallow: \/\s*$/m);
});

async function sitemapUrls(request: import('@playwright/test').APIRequestContext): Promise<{ index: string; urls: string[] }> {
  const index = await request.get('/sitemap.xml'); // rewritten/redirected to core's /wp-sitemap.xml
  expect(index.status()).toBe(200);
  const indexXml = await index.text();
  expect(indexXml).toContain('<sitemapindex');
  const locs = [...indexXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  const urls: string[] = [];
  for (const loc of locs) {
    const sub = await request.get(loc);
    expect(sub.status(), loc).toBe(200);
    urls.push(...[...(await sub.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
  }
  return { index: indexXml, urls };
}

test('sitemap.xml lists the real pages, ClipForge included, and nothing noindex', async ({ request }) => {
  const { index, urls } = await sitemapUrls(request);
  const paths = urls.map((u) => new URL(u).pathname);
  for (const p of ['/apps/clipforge/', '/apps/', '/learn/', '/learn/seo-walkthrough/', '/blog/', postPath, '/about/', '/contact/', '/privacy/']) expect(paths, p).toContain(p);
  for (const p of ['/my-account/', '/cart/', '/checkout/', '/shop/', '/product/clipforge/', '/apps/hidden-draft/']) expect(paths, p).not.toContain(p);
  expect(index).not.toMatch(/taxonomies|users|product/);
});

test('an empty module drops out of the sitemap (no videos: no Learn)', async ({ request }) => {
  await trash(api, 'video', videoId);
  const { index, urls } = await sitemapUrls(request);
  expect(index).not.toContain('posts-video');
  expect(urls.map((u) => new URL(u).pathname)).not.toContain('/learn/');
});

test('theme-color is a dark/light pair chosen by the OS colour scheme', async ({ page }) => {
  await page.goto('/');
  const pair = await page.locator('meta[name="theme-color"]').evaluateAll((els) => els.map((e) => [e.getAttribute('media'), e.getAttribute('content')]));
  expect(pair).toEqual([['(prefers-color-scheme: dark)', '#0B1230'], ['(prefers-color-scheme: light)', '#F8FAFF']]);
});
