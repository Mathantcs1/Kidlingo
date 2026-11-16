import { test, expect } from '@playwright/test';
import { adminApi, cleanup, createPost, resetContent, send, signOffAndPublish, type Api } from './helpers/wp';

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
  id = await createPost(api, 'Review fixture', { status: 'draft', content: '<p>Original body.</p>', meta: { ita_starter_slug: SLUG } });
});
test.afterAll(async () => { await cleanup(api); await resetContent(api); });

test('REST cannot publish an unreviewed starter post, and visitors get a 404', async ({ page }) => {
  await send(api, 'POST', `/wp/v2/posts/${id}`, { status: 'publish' });
  expect(await statusOf(id)).toBe('draft');
  const res = await page.goto(`/?p=${id}`);
  expect(res?.status()).toBe(404);
});

test('a publish via REST with the starter meta in the same request is also pulled back', async () => {
  const made = await createPost(api, 'Same request', { status: 'publish', content: '<p>x</p>', meta: { ita_starter_slug: '02-ml-vs-deep-learning-vs-generative-ai' } });
  expect(await statusOf(made)).toBe('draft');
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

test('posts without a review status are unaffected', async () => {
  const own = await createPost(api, 'My own post', { content: '<p>Mine.</p>' });
  expect(await statusOf(own)).toBe('publish');
  await send(api, 'POST', `/wp/v2/posts/${own}`, { content: '<p>Edited.</p>' });
  expect(await statusOf(own)).toBe('publish');
});

test('the posts list has the Review column and filter; Settings shows the installer section', async () => {
  const list = await (await api.ctx.get('/wp-admin/edit.php?ita_review=human_reviewed')).text();
  expect(list).toContain('name="ita_review"');
  expect(list).toContain('column-ita_review');
  expect(list).toContain('Review fixture');
  const none = await (await api.ctx.get('/wp-admin/edit.php?ita_review=ai_draft')).text();
  expect(none).not.toContain('Review fixture');
  const settings = await (await api.ctx.get('/wp-admin/options-general.php?page=ideatoapps-settings')).text();
  expect(settings).toContain('Install starter articles');
  expect(settings).toMatch(/\d+ of \d+ starter articles human reviewed/);
  expect(settings).toMatch(/\d+ of \d+ article files are installed/);
});
