import { test, expect } from '@playwright/test';
import { axeProblems } from './helpers/a11y';
import { horizontalOverflow } from './helpers/layout';
import { addVersion, adminApi, cleanup, createApp, createCategory, createWooProduct, resetContent, uploadFile, uploadImage, uploadZip, type AppInput, type Api } from './helpers/wp';

test.describe.configure({ mode: 'serial' });

let api: Api;
test.beforeAll(async () => { api = await adminApi(); await resetContent(api); });
test.afterEach(async ({}, info) => { if (!info.titlePath.some((t) => t.includes('ClipForge listing, fully populated'))) await cleanup(api); });
test.afterAll(async () => { await resetContent(api); });

// The same copy the seed (`wp ideatoapps seed-clipforge`) writes; the seed itself is asserted in tests/php/SeedClipforgeTest.php.
const FEATURES = [
  'Import video, audio and images, including screen recordings without sound',
  'Arrange, trim and split clips on a timeline; ripple delete; snapping',
  'Stack video layers and audio tracks (up to 8 of each) with mute, solo, lock and hide',
  'Move, scale and rotate a clip on the preview for picture-in-picture',
  'YouTube 16:9, Vertical 9:16, Square 1:1 and Portrait 4:5 formats',
  'Undo/redo and autosave in your browser',
  'Export MP4 (H.264 + AAC) at 1080p or 4K',
  'Runs locally: your media is never uploaded',
];
const NOTE = 'Chromium-based desktop browser (Safari untested). Python 3 or Node.js is needed to run the included local launcher.';
const PLATFORMS = 'Chromium-based desktop browser (Safari untested); Python 3 or Node.js to run the local launcher';
const FAQ = [
  { q: 'Do I need an internet connection?', a: 'Once downloaded it runs from your computer. Your media never leaves it.' },
  { q: 'Which browsers work?', a: 'ClipForge is tested in desktop Chrome. Safari is untested.' },
  { q: 'How do I get updates?', a: 'New versions are listed under What\'s new on this page when they are released.' },
];
const clipforge = (extra: Partial<AppInput> = {}): AppInput => ({
  title: 'ClipForge',
  price: '$24.99 one-time',
  tagline: 'Edit videos in your browser. Your files stay on your device.',
  platforms: PLATFORMS,
  features: FEATURES,
  faq: FAQ,
  content: `<p>${NOTE}</p>`,
  ...extra,
});
const BANNED = /free to try|audio editing|effects|animation|\brat(ing|ings)\b|\breviews?\b|testimonial|customers?\b|users?\b|stars?\b|★|\d+\s*\+?\s*(downloads|sales)/i;

test.describe('ClipForge listing', () => {
  test('shows the title, tagline, breadcrumb and the exact buy button linking to add-to-cart', async ({ page }) => {
    const product = await createWooProduct(api, 'ClipForge');
    // T8: the buy button only exists once a version has a real zip, so the fixture adds one.
    await createApp(api, clipforge({ wooProductId: product, version: { version: '1.0.0', changelog: 'First release.', attachment: await uploadZip(api, '1.0.0') } }));
    await page.goto('/apps/clipforge/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ClipForge');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByTestId('app-tagline')).toHaveText('Edit videos in your browser. Your files stay on your device.');
    const crumbs = page.getByRole('navigation', { name: 'Breadcrumb' });
    await expect(crumbs.getByRole('link', { name: 'Apps' })).toHaveAttribute('href', /\/apps\/$/);
    await expect(crumbs.locator('[aria-current="page"]')).toHaveText('ClipForge');
    const buy = page.getByTestId('buy-area').getByRole('link', { name: 'Buy ClipForge, $24.99 one-time' });
    await expect(buy).toHaveCount(1);
    await expect(buy).toHaveAttribute('href', new RegExp(`[?&]add-to-cart=${product}$`));
    await expect(page.getByTestId('buy-area')).not.toContainText('Coming soon');
  });

  test('lists the README-sourced features, the requirements note and platforms', async ({ page }) => {
    await createApp(api, clipforge());
    await page.goto('/apps/clipforge/');
    const features = page.getByTestId('app-features');
    await expect(features.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(features.locator('li')).toHaveText(FEATURES);
    const req = page.getByTestId('app-requirements');
    await expect(req).toContainText(NOTE);
    await expect(req).toContainText(PLATFORMS);
    await expect(req.getByRole('heading', { level: 2 })).toHaveText('Requirements');
  });

  test('FAQ is an accessible details/summary accordion that opens with the keyboard', async ({ page }) => {
    await createApp(api, clipforge());
    await page.goto('/apps/clipforge/');
    const faq = page.getByTestId('app-faq');
    await expect(faq.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(faq.locator('details')).toHaveCount(3);
    await expect(faq.locator('details > summary')).toHaveText(FAQ.map((f) => f.q));
    await expect(faq.locator('details[open]')).toHaveCount(0);
    const first = faq.locator('details').first();
    await first.locator('summary').focus();
    await page.keyboard.press('Enter');
    await expect(first).toHaveAttribute('open', '');
    await expect(first).toContainText(FAQ[0].a);
    await page.keyboard.press('Space');
    await expect(first).not.toHaveAttribute('open', '');
  });

  test('never claims anything it cannot back: no free trial, audio editing, effects, animation, ratings or counts', async ({ page }) => {
    const product = await createWooProduct(api, 'ClipForge');
    await createApp(api, clipforge({ wooProductId: product, launchUrl: 'https://example.org/launch', demoUrl: 'https://example.org/demo', version: { version: '1.0.0', changelog: 'First release.', attachment: await uploadZip(api, '1.0.0') } }));
    await page.goto('/apps/clipforge/');
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(/free/i);
    for (const s of ['Free to try', 'audio editing', 'effects', 'animation']) expect(text.toLowerCase()).not.toContain(s.toLowerCase());
  });

  test('public HTML never leaks a download: no .zip, no uploads link, no attachment id, version numbers and changelog only', async ({ page }) => {
    const zip = await uploadFile(api, 'clipforge-1.0.0.zip', 'application/zip', Buffer.from('PK\x05\x06' + '\0'.repeat(18), 'binary'));
    const zip2 = await uploadFile(api, 'clipforge-1.1.0.zip', 'application/zip', Buffer.from('PK\x05\x06' + '\0'.repeat(18), 'binary'));
    const media = await uploadImage(api);
    const input = clipforge({ media });
    const id = await createApp(api, { ...input, version: { version: '1.0.0', changelog: 'First release.', attachment: zip } });
    await addVersion(api, id, input, { version: '1.1.0', changelog: 'Fixes and polish.\nSecond line.', attachment: zip2 });
    const res = await page.request.get('/apps/clipforge/');
    const html = await res.text();
    expect(html).not.toMatch(/\.zip/i);
    expect(html).not.toMatch(/clipforge-1\.\d\.\d/i);
    expect(html).not.toMatch(/attachment_id|attachment-id|download=|ideatoapps-download/i);
    await page.goto('/apps/clipforge/');
    await expect(page.locator('a[href*="wp-content/uploads"], a[href$=".zip"], a[download]')).toHaveCount(0);

    const news = page.getByTestId('app-whats-new');
    await expect(news.getByRole('heading', { level: 2 })).toHaveText("What's new");
    const items = news.locator('[data-testid="version"]');
    await expect(items).toHaveCount(2);
    await expect(items.nth(0)).toContainText('1.1.0'); // newest first
    await expect(items.nth(0)).toContainText('Fixes and polish.');
    await expect(items.nth(0)).toContainText('Second line.');
    await expect(items.nth(0).locator('time')).toHaveAttribute('datetime', /^\d{4}-\d{2}-\d{2}$/);
    await expect(items.nth(1)).toContainText('1.0.0');
    await expect(items.nth(1)).toContainText('First release.');
  });

  test('a coming soon app says Coming soon, with no price, no buy button and no add-to-cart link', async ({ page }) => {
    const product = await createWooProduct(api, 'Soon App');
    await createApp(api, { title: 'Soon App', delivery: 'coming_soon', price: '$9.99 one-time', tagline: 'On its way.', wooProductId: product });
    await page.goto('/apps/soon-app/');
    const buy = page.getByTestId('buy-area');
    await expect(buy).toContainText('Coming soon');
    await expect(buy).not.toContainText('$');
    await expect(page.getByRole('link', { name: /^Buy/ })).toHaveCount(0);
    await expect(page.locator('a[href*="add-to-cart"]')).toHaveCount(0);
    expect(await page.locator('main').innerText()).not.toContain('$9.99');
  });

  test('a live app without a linked product has no buy button, and Launch / Watch demo only appear when set', async ({ page }) => {
    await createApp(api, { title: 'Plain App', price: '$3.00 one-time' });
    await page.goto('/apps/plain-app/');
    await expect(page.getByRole('link', { name: /^Buy/ })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Launch' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Watch demo' })).toHaveCount(0);
    await expect(page.locator('main a[href=""], main a:not([href]), main button:not([type])')).toHaveCount(0);

    await createApp(api, { title: 'Linked App', launchUrl: 'https://example.org/launch', demoUrl: 'https://example.org/demo' });
    await page.goto('/apps/linked-app/');
    await expect(page.getByRole('link', { name: 'Launch' })).toHaveAttribute('href', 'https://example.org/launch');
    await expect(page.getByRole('link', { name: 'Watch demo' })).toHaveAttribute('href', 'https://example.org/demo');
    await expect(page.getByRole('link', { name: 'Launch' })).toHaveAttribute('rel', /noopener/);

    await createApp(api, { title: 'Bad Link App', launchUrl: 'javascript:alert(1)', demoUrl: 'ftp://example.org/x' });
    await page.goto('/apps/bad-link-app/');
    await expect(page.getByRole('link', { name: 'Launch' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Watch demo' })).toHaveCount(0);
    await expect(page.locator('a[href^="javascript:"], a[href^="ftp:"]')).toHaveCount(0);
  });

  test('sections without content are absent, not empty (a bare app has only title and buy area)', async ({ page }) => {
    await createApp(api, { title: 'Bare App', delivery: 'coming_soon' });
    await page.goto('/apps/bare-app/');
    for (const id of ['app-features', 'app-requirements', 'app-faq', 'app-whats-new', 'related-apps']) await expect(page.getByTestId(id)).toHaveCount(0);
    await expect(page.locator('main details, main ul:empty, main ol:empty, main p:empty')).toHaveCount(0);
    await expect(page.getByTestId('app-tagline')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 2 })).toHaveCount(0);
  });

  test('uses the featured image, or a designed placeholder when missing', async ({ page }) => {
    const media = await uploadImage(api);
    await createApp(api, { title: 'With Image', media });
    await page.goto('/apps/with-image/');
    const icon = page.getByTestId('app-icon');
    await expect(icon.locator('img')).toHaveCount(1);
    await expect(icon.locator('img')).toHaveAttribute('width', /\d+/);
    await expect(icon.locator('img')).toHaveAttribute('height', /\d+/);

    await createApp(api, { title: 'No Image' });
    await page.goto('/apps/no-image/');
    const ph = page.getByTestId('app-icon');
    await expect(ph).toBeVisible();
    await expect(ph.locator('img')).toHaveCount(0);
    await expect(ph).toHaveAttribute('aria-hidden', 'true');
  });

  test('related apps appear only when another live app exists, never the app itself, never coming soon or hidden ones', async ({ page }) => {
    await createApp(api, { title: 'Main App', tagline: 'Main' });
    await page.goto('/apps/main-app/');
    await expect(page.getByTestId('related-apps')).toHaveCount(0);

    await createApp(api, { title: 'Soon Sibling', delivery: 'coming_soon' });
    await createApp(api, { title: 'Hidden Sibling', delivery: 'draft' });
    await createApp(api, { title: 'Draft Sibling', status: 'draft' });
    await page.goto('/apps/main-app/');
    await expect(page.getByTestId('related-apps')).toHaveCount(0);

    await createApp(api, { title: 'Live Sibling', price: '$2.00 one-time' });
    await page.goto('/apps/main-app/');
    const related = page.getByTestId('related-apps');
    await expect(related.locator('.card__title')).toHaveText(['Live Sibling']);
    await expect(related).toContainText('$2.00 one-time');
    await expect(related.getByRole('heading', { level: 2 })).toBeVisible();
  });

  test('an app whose delivery status is draft (or that is unpublished) is a 404 for visitors', async ({ page }) => {
    await createApp(api, { title: 'Hidden Delivery', delivery: 'draft' });
    await createApp(api, { title: 'Unpublished Thing', status: 'draft' });
    const hidden = await page.goto('/apps/hidden-delivery/');
    expect(hidden?.status()).toBe(404);
    const draft = await page.goto('/apps/unpublished-thing/');
    expect(draft?.status()).toBe(404);
    const soon = await createApp(api, { title: 'Soon Visible', delivery: 'coming_soon' });
    const ok = await page.goto('/apps/soon-visible/');
    expect(ok?.status()).toBe(200);
    expect(soon).toBeGreaterThan(0);
  });

  test('the editor content and fields are escaped', async ({ page }) => {
    let dialog = false;
    page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
    await createApp(api, { title: 'Esc <b>App</b>', tagline: '<img src=x onerror=alert(1)>', features: ['<script>alert(2)</script> feature'], faq: [{ q: '<i>Q</i>?', a: '<script>alert(3)</script>A' }], price: '<u>$1</u>', platforms: '<img src=x onerror=alert(4)>' });
    await page.goto('/apps/esc-app/');
    await page.waitForTimeout(300);
    expect(dialog).toBe(false);
    await expect(page.locator('main img[src="x"], main script:not([type="application/ld+json"])')).toHaveCount(0);
    // Task 9: the structured data is a script too. Its text must hold no raw markup (JSON_HEX_TAG escapes < and >) and parse as JSON.
    const ld = await page.locator('main script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => e.textContent ?? ''));
    expect(ld).toHaveLength(1);
    expect(ld[0]).not.toMatch(/<|>/);
    expect(JSON.parse(ld[0]).name).toBe('Esc <b>App</b>');
    await expect(page.locator('main b, main u, main i')).toHaveCount(0);
  });
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme, ClipForge listing, fully populated`, () => {
    test.use({ colorScheme: theme });
    test.beforeAll(async () => {
      const cat = await createCategory(api, 'Creator');
      const product = await createWooProduct(api, 'ClipForge');
      const media = await uploadImage(api);
      const input = clipforge({ wooProductId: product, launchUrl: 'https://example.org/launch', demoUrl: 'https://example.org/demo', categories: [cat], media });
      const id = await createApp(api, { ...input, version: { version: '1.0.0', changelog: 'First public release.', attachment: await uploadZip(api, '1.0.0') } });
      await addVersion(api, id, input, { version: '1.1.0', changelog: 'Small fixes.', attachment: await uploadZip(api, '1.1.0') });
      await createApp(api, { title: 'A much longer app name that has to wrap on small screens', tagline: 'Another useful idea.', price: '$4.00 one-time' });
    });
    test.afterAll(async () => { await cleanup(api); });

    for (const w of [360, 390, 768, 1024, 1440]) {
      test(`no horizontal overflow at ${w}px`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto('/apps/clipforge/');
        await expect(page.getByTestId('related-apps')).toBeVisible();
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }
    for (const w of [360, 1440]) {
      test(`axe: no serious/critical violations and no unverified contrast at ${w}px`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto('/apps/clipforge/');
        await expect(page.getByTestId('related-apps')).toBeVisible();
        await page.locator('[data-testid="app-faq"] details').first().locator('summary').click(); // open state is audited too
        await page.evaluate(() => window.scrollTo(0, 0)); // the sticky header is translucent: axe cannot measure it while content scrolls beneath it (shell behaviour, same on every page)
        expect(await axeProblems(page)).toEqual([]);
      });
    }
    test('headings never skip a level and there is one h1', async ({ page }) => {
      await page.goto('/apps/clipforge/');
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      const levels = await page.locator('main :is(h1,h2,h3,h4)').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
      for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    });
  });
}
