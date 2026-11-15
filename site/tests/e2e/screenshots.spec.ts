import { test } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { adminApi, cleanup, createApp, createCategory, createWooProduct, resetContent, type Api } from './helpers/wp';

// Task 6 review screenshots. Not a test of behaviour: skipped unless SCREENSHOTS=1 (npm run test:e2e with SCREENSHOTS=1).
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate docs/screenshots/task-6');
test.describe.configure({ mode: 'serial' });

const out = 'docs/screenshots/task-6';
let api: Api;
test.beforeAll(async () => { api = await adminApi(); await resetContent(api); mkdirSync(out, { recursive: true }); });
test.afterAll(async () => { await resetContent(api); });

const shots = async (page: import('@playwright/test').Page, url: string, name: string) => {
  for (const scheme of ['dark', 'light'] as const) {
    for (const [width, height] of [[1440, 900], [390, 844]] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${out}/${name}-${scheme}-${width}.png`, fullPage: true });
    }
  }
};

test('empty catalog', async ({ page }) => { await shots(page, '/apps/', 'catalog-empty'); });

test('populated catalog, zero results and the ClipForge page', async ({ page }) => {
  test.setTimeout(240_000);
  const creator = await createCategory(api, 'Creator');
  const utilities = await createCategory(api, 'Utilities');
  const product = await createWooProduct(api, 'ClipForge');
  await createApp(api, {
    title: 'ClipForge', price: '$24.99 one-time', tagline: 'Edit videos in your browser. Your files stay on your device.', categories: [creator], wooProductId: product,
    platforms: 'Chromium-based desktop browser (Safari untested); Python 3 or Node.js to run the local launcher',
    content: '<p>Chromium-based desktop browser (Safari untested). Python 3 or Node.js is needed to run the included local launcher.</p>',
    features: ['Import video, audio and images, including screen recordings without sound', 'Arrange, trim and split clips on a timeline; ripple delete; snapping', 'Stack video layers and audio tracks (up to 8 of each) with mute, solo, lock and hide', 'Move, scale and rotate a clip on the preview for picture-in-picture', 'YouTube 16:9, Vertical 9:16, Square 1:1 and Portrait 4:5 formats', 'Undo/redo and autosave in your browser', 'Export MP4 (H.264 + AAC) at 1080p or 4K', 'Runs locally: your media is never uploaded'],
    faq: [
      { q: 'Do I need an internet connection?', a: 'Once downloaded, ClipForge runs from your computer, and your media never leaves it.' },
      { q: 'Which browsers work?', a: 'ClipForge is tested in desktop Chrome. Safari is untested.' },
      { q: 'How do I get updates?', a: 'New versions are listed under What\'s new on this page when they are released.' },
    ],
  });
  await createApp(api, { title: 'Budget Buddy', price: '$9.00 one-time', tagline: 'Track what you spend.', categories: [utilities] });
  await createApp(api, { title: 'Zen Timer', delivery: 'coming_soon', tagline: 'Focus sessions that stay out of your way.', categories: [utilities] });
  await shots(page, '/apps/', 'catalog-populated');
  await shots(page, '/apps/?s=nothing-matches&category=creator', 'catalog-zero-results');
  await shots(page, '/apps/clipforge/', 'clipforge');
  await cleanup(api);
});
