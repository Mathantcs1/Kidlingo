import { test, expect } from '@playwright/test';
import { adminApi, cleanup, createPost, installStarter, resetContent, send, signOffAndPublish, type Api } from './helpers/wp';

// The human review gate on a real site: starter posts cannot go live without a typed-name, seven-tick sign-off.
test.describe.configure({ mode: 'serial' });

let api: Api;
let id = 0;
const SLUG = '01-what-ai-is-and-isnt';
const statusOf = async (postId: number) => (await send(api, 'GET', `/wp/v2/posts/${postId}`, undefined, 'context=edit')).status as string;
const today = () => new Date().toISOString().slice(0, 10);

test.beforeAll(async () => {
  api = await adminApi();
  await resetContent(api);
  id = await installStarter(api, SLUG);
});
test.afterAll(async () => { await cleanup(api); await resetContent(api); });

test('REST cannot publish an unreviewed starter post, and visitors get a 404', async ({ page }) => {
  await send(api, 'POST', `/wp/v2/posts/${id}`, { status: 'publish' });
  expect(await statusOf(id)).toBe('draft');
  const res = await page.goto(`/?p=${id}`);
  expect(res?.status()).toBe(404);
});

test('REST cannot attach a post to the gate or detach a starter post from it', async () => {
  const res = await api.ctx.fetch(`/?rest_route=${encodeURIComponent(`/wp/v2/posts/${id}`)}`, { method: 'POST', headers: { 'X-WP-Nonce': api.nonce }, data: { meta: { ita_starter_slug: '' } } });
  expect(res.ok()).toBe(false);
  expect((await send(api, 'GET', `/wp/v2/posts/${id}`, undefined, 'context=edit')).meta.ita_starter_slug).toBe(SLUG);
});

test('the Editorial review box lists the seven checks and never prefills the reviewer name', async () => {
  const html = await (await api.ctx.get(`/wp-admin/post.php?post=${id}&action=edit`)).text();
  expect(html).toContain('Editorial review');
  expect((html.match(/name="ita_review_check\[\]"/g) ?? []).length).toBe(7);
  expect(html).toMatch(/name="ita_review_name"[^>]*value=""/);
  expect(html).toContain('Mark as human reviewed');
});

test('a sign-off with six ticks or no name changes nothing', async () => {
  await signOffAndPublish(api, id, 'Dana Reviewer', { ticks: ['facts', 'examples', 'words', 'prompts', 'quiz', 'links'] });
  expect(await statusOf(id)).toBe('draft');
  await signOffAndPublish(api, id, '   ');
  expect(await statusOf(id)).toBe('draft');
});

test('a complete sign-off publishes, and the byline and Last reviewed follow the human review', async ({ page }) => {
  await signOffAndPublish(api, id, 'Dana <i>Reviewer</i>');
  expect(await statusOf(id)).toBe('publish');
  await page.goto(`/?p=${id}`);
  const byline = page.getByTestId('post-byline');
  await expect(byline).toContainText('Drafted with AI assistance. Edited and reviewed by Dana Reviewer on ');
  expect(await byline.locator('i').count(), 'name is escaped').toBe(0);
  await expect(page.getByTestId('post-meta')).toContainText('Last reviewed');
  expect(await page.getByTestId('post-meta').locator('time').last().getAttribute('datetime')).toBe(today());
});

test('editing the content after sign-off moves the post back to draft and needs a re-sign', async ({ page }) => {
  await send(api, 'POST', `/wp/v2/posts/${id}`, { content: '<p>Changed after sign-off.</p>' });
  expect(await statusOf(id)).toBe('draft');
  expect((await page.goto(`/?p=${id}`))?.status()).toBe(404);
  await send(api, 'POST', `/wp/v2/posts/${id}`, { status: 'publish' });
  expect(await statusOf(id)).toBe('draft');
  const html = await (await api.ctx.get(`/wp-admin/post.php?post=${id}&action=edit`)).text();
  expect(html).toContain('Re-sign');
  await signOffAndPublish(api, id, 'Second Reviewer');
  expect(await statusOf(id)).toBe('publish');
});

test('a title change after sign-off also needs a re-sign', async () => {
  await send(api, 'POST', `/wp/v2/posts/${id}`, { title: 'A new title after sign-off' });
  expect(await statusOf(id)).toBe('draft');
});

test('posts without a review status are unaffected', async () => {
  const own = await createPost(api, 'My own post', { content: '<p>Mine.</p>' });
  expect(await statusOf(own)).toBe('publish');
  await send(api, 'POST', `/wp/v2/posts/${own}`, { content: '<p>Edited.</p>' });
  expect(await statusOf(own)).toBe('publish');
});

test('the posts list has the Review column and filter; Settings shows the installer section', async () => {
  const list = await (await api.ctx.get('/wp-admin/edit.php?ita_review=needs_review')).text();
  expect(list).toContain('name="ita_review"');
  expect(list).toContain('column-ita_review');
  expect(list).toContain('A new title after sign-off');
  const none = await (await api.ctx.get('/wp-admin/edit.php?ita_review=ai_draft')).text();
  expect(none).not.toContain('A new title after sign-off');
  const settings = await (await api.ctx.get('/wp-admin/options-general.php?page=ideatoapps-settings')).text();
  expect(settings).toContain('Install starter articles');
  expect(settings).toMatch(/\d+ of \d+ installed starter articles human reviewed/);
  expect(settings).toMatch(/\d+ article files not installed yet/);
  expect(settings).toMatch(/\d+ of \d+ article files are installed/);
});

test('real editor: a refused Publish says why; sign off in the block editor, then press Publish again', async ({ page }) => {
  test.setTimeout(180_000);
  const second = await installStarter(api, '02-ml-vs-deep-learning-vs-generative-ai');
  await page.goto('/wp-login.php');
  await page.fill('#user_login', 'admin');
  await page.fill('#user_pass', 'password');
  await Promise.all([page.waitForURL(/wp-admin/), page.click('#wp-submit')]);
  await page.goto(`/wp-admin/post.php?post=${second}&action=edit`);
  await page.evaluate(() => { try { (window as any).wp.data.dispatch('core/preferences').set('core/edit-post', 'welcomeGuide', false); (window as any).wp.data.dispatch('core/preferences').set('core/edit-post', 'fullscreenMode', false); } catch { /* ignore */ } });
  const box = page.getByTestId('review-box');
  await expect(box).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId('review-claims').locator('li')).toHaveCount(3);
  const publish = async () => {
    const confirm = page.locator('.editor-post-publish-panel__header-publish-button .editor-post-publish-button');
    if (!(await confirm.isVisible())) await page.locator('.editor-post-publish-panel__toggle').click();
    await confirm.click();
  };
  // Publish without a sign-off: refused with the reason shown in the editor, and the post stays a draft.
  await publish();
  await expect(page.locator('.components-notice, .components-snackbar').filter({ hasText: 'Not published: needs human review' }).first()).toBeVisible({ timeout: 30_000 });
  expect(await statusOf(second)).toBe('draft');
  await page.reload();
  await expect(box).toBeVisible({ timeout: 30_000 });
  await page.fill('#ita-review-name', 'Real UI Reviewer');
  for (const cb of await box.locator('input[name="ita_review_check[]"]').all()) await cb.check();
  await page.getByTestId('review-sign').check();
  await publish();
  // The block editor saves the post first (forced to draft), then the box: signed off but still a draft.
  await expect(page.getByTestId('review-box-result')).toContainText('press Publish again', { timeout: 30_000 });
  expect(await statusOf(second)).toBe('draft');
  await expect(page.getByTestId('review-status')).toHaveText('Human reviewed');
  await publish();
  await expect.poll(() => statusOf(second), { timeout: 30_000 }).toBe('publish');
  await page.goto(`/?p=${second}`);
  await expect(page.getByTestId('post-byline')).toContainText('Drafted with AI assistance. Edited and reviewed by Real UI Reviewer on ');
});
