import { test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { adminApi, cleanup, createApp, createPost, createVideo, resetContent, saveSettings, type Api } from './helpers/wp';

// Task 7 review screenshots. Not a test of behaviour: skipped unless SCREENSHOTS=1.
test.skip(!process.env.SCREENSHOTS, 'set SCREENSHOTS=1 to regenerate docs/screenshots/task-7');
test.describe.configure({ mode: 'serial' });

const out = 'docs/screenshots/task-7';
let api: Api;
test.beforeAll(async () => { api = await adminApi(); await resetContent(api); mkdirSync(out, { recursive: true }); });
test.afterAll(async () => { await resetContent(api); });

const shots = async (page: Page, url: string, name: string) => {
  for (const scheme of ['dark', 'light'] as const) {
    for (const [width, height] of [[1440, 900], [360, 740]] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      await page.setViewportSize({ width, height });
      await page.goto(url);
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({ path: `${out}/${name}-${scheme}-${width}.png`, fullPage: true });
    }
  }
};

test('empty states and static pages', async ({ page }) => {
  test.setTimeout(240_000);
  await shots(page, '/learn/', 'learn-empty');
  await shots(page, '/blog/', 'blog-empty');
  await shots(page, '/about/', 'about');
  await shots(page, '/faq/', 'faq');
  await shots(page, '/contact/', 'contact-disabled');
  await shots(page, '/privacy/', 'privacy');
  await shots(page, '/terms/', 'terms');
  await shots(page, '/refund-policy/', 'refund-policy');
});

test('populated learn, blog, contact form and home sign-up', async ({ page }) => {
  test.setTimeout(240_000);
  const app = await createApp(api, { title: 'ClipForge', price: '$24.99 one-time', tagline: 'Edit video in your browser. Nothing leaves your computer.' });
  const video = await createVideo(api, 'ClipForge walkthrough', { youtubeId: 'dQw4w9WgXcQ', excerpt: 'A first look at the editor.', relatedApp: app, content: '<p>What you will see in this short tour.</p>' });
  await createVideo(api, 'A longer title that wraps over two lines on a phone screen', { youtubeId: 'aqz-KE-bpKQ', excerpt: 'Timeline basics.' });
  const post = await createPost(api, 'Hello from IdeaToApps', { content: '<p>The first post.</p><h2>A heading</h2><p>More text and a <a href="/apps/">link</a>.</p>' });
  await createPost(api, 'Second note');
  await saveSettings(api, { contact: true, channel: 'https://www.youtube.com/@ideatoapps' });
  await shots(page, '/learn/', 'learn-populated');
  await shots(page, '/blog/', 'blog-populated');
  await shots(page, `/?post_type=video&p=${video}`, 'video-page');
  await shots(page, `/?p=${post}`, 'post');
  await shots(page, '/contact/', 'contact-enabled');
  await shots(page, '/', 'home-newsletter');
  await cleanup(api);
});
