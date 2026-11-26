import { readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { adminApi, createPost, send, trash, type Api } from './helpers/wp';
import { axeProblems } from './helpers/a11y';
import { horizontalOverflow } from './helpers/layout';

// The MCP demo kit blog post: the ready-to-publish markup in content/posts/ renders on the real theme, the download
// button serves the exact kit zip as a public static file (not a private media-library upload), and the code block is
// readable and accessible on phone and desktop in both colour schemes.
const siteRoot = join(__dirname, '..', '..');
const markup = readFileSync(join(siteRoot, 'content', 'posts', 'mcp-demo-kit.html'), 'utf8');
const kitFile = readFileSync(join(siteRoot, 'wp-content', 'themes', 'ideatoapps', 'assets', 'downloads', 'mcp-demo-kit.zip'));
const TITLE = 'Build your first MCP server (Python, 43 lines), plus the delete test';

test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

let api: Api;
let postId = 0;
let path = '';

test.beforeAll(async () => {
  test.setTimeout(120_000);
  api = await adminApi();
  postId = await createPost(api, TITLE, { content: markup });
  const post = await send(api, 'GET', `/wp/v2/posts/${postId}`);
  path = new URL(post.link).pathname + new URL(post.link).search;
});
test.afterAll(async () => { if (postId) await trash(api, 'posts', postId).catch(() => undefined); });

test('the post shows the title, the steps and the whole 43-line server', async ({ page }) => {
  await page.goto(path);
  await expect(page.getByTestId('post').getByRole('heading', { level: 1 })).toHaveText(TITLE);
  const code = page.locator('.prose pre code');
  await expect(code).toHaveCount(1);
  const text = await code.innerText();
  expect(text.split('\n').length).toBe(43);
  expect(text).toContain('from mcp.server import MCPServer');
  expect(text).toContain('def run_sql(query: str) -> str:'); // the arrow survived HTML escaping
  expect(text).toContain('Blocked: this server only allows SELECT queries.');
  const style = await page.locator('.prose pre').evaluate((el) => { const c = getComputedStyle(el); return { ws: c.whiteSpace, bg: c.backgroundColor, ow: c.overflowWrap }; });
  expect(style.ws, 'long code lines wrap instead of needing a scroll region').toBe('pre-wrap');
  expect(style.ow).toBe('anywhere');
  expect(style.bg, 'solid background so contrast is verifiable').not.toMatch(/rgba\(0, 0, 0, 0\)|transparent/);
  await expect(page.locator('.prose ol').first().locator('li')).toHaveCount(5);
  await expect(page.locator('.prose')).not.toContainText('VIDEO_LINK_HERE');
  await expect(page.locator('.prose')).not.toContainText('KIT_DOWNLOAD_LINK_HERE');
});

test('the download button serves the exact kit zip, publicly, to a visitor who is not signed in', async ({ page, request }) => {
  await page.goto(path);
  const link = page.getByRole('link', { name: 'Download the demo kit (zip)' });
  await expect(link).toHaveAttribute('href', '/wp-content/themes/ideatoapps/assets/downloads/mcp-demo-kit.zip');
  const res = await request.get('/wp-content/themes/ideatoapps/assets/downloads/mcp-demo-kit.zip');
  expect(res.status()).toBe(200);
  const body = await res.body();
  expect(body.subarray(0, 2).toString('latin1')).toBe('PK');
  expect(body.equals(kitFile)).toBe(true);
});

for (const scheme of ['dark', 'light'] as const) {
  for (const width of [360, 1440]) {
    test(`${scheme} at ${width}px: no accessibility or contrast problems and no sideways scroll`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ colorScheme: scheme });
      await page.goto(path);
      await expect(page.locator('.prose pre')).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      expect(await axeProblems(page)).toEqual([]);
      if (process.env.SCREENSHOTS) {
        const dir = join(siteRoot, 'docs', 'screenshots', 'mcp-post');
        mkdirSync(dir, { recursive: true });
        await page.screenshot({ path: join(dir, `post-${scheme}-${width}.png`), fullPage: true });
      }
    });
  }
}
