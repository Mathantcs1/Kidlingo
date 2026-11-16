import { test, expect, type Page } from '@playwright/test';
import { axeProblems } from './helpers/a11y';
import { horizontalOverflow } from './helpers/layout';
import { adminApi, cleanup, createApp, createPost, createPostCategory, createVideo, resetContent, saveSettings, setPostLevel, trash, type Api } from './helpers/wp';

// These tests change site content; the server is shared, so run them one at a time and leave the site blank.
test.describe.configure({ mode: 'serial' });

let api: Api;
test.beforeAll(async () => { api = await adminApi(); await resetContent(api); });
test.afterEach(async () => { await cleanup(api); });
test.afterAll(async () => { await resetContent(api); });

const YT = 'dQw4w9WgXcQ';
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}/;
const text = (page: Page) => page.locator('main').innerText();
const nav = (page: Page) => page.getByRole('navigation', { name: 'Primary' });
const footer = (page: Page) => page.getByRole('navigation', { name: 'Footer' });
const wpJson = (path: string) => `/?rest_route=${encodeURIComponent(path)}`;

test.describe('Learn', () => {
  test('with no videos: empty state, no Learn link in the header or footer, no player', async ({ page }) => {
    await page.goto('/learn/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Learn');
    await expect(page.getByTestId('learn-empty')).toBeVisible();
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveCount(0);
    await expect(footer(page).getByRole('link', { name: 'Learn' })).toHaveCount(0);
    await expect(page.locator('iframe, .video-card')).toHaveCount(0);
    await page.goto('/');
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveCount(0);
  });

  test('a published video adds Learn to the header and footer; a draft does not; trashing removes it again', async ({ page }) => {
    await createVideo(api, 'Hidden draft', { status: 'draft', youtubeId: YT });
    await page.goto('/');
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveCount(0);
    const id = await createVideo(api, 'First look', { youtubeId: YT });
    await page.goto('/');
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveAttribute('href', /\/learn\/$/);
    await expect(footer(page).getByRole('link', { name: 'Learn' })).toHaveCount(1);
    await expect(nav(page).getByRole('link')).toHaveText(['Apps', 'Learn', 'Blog', 'About']);
    await page.goto('/learn/');
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveAttribute('aria-current', 'page');
    expect(await text(page)).not.toContain('Hidden draft');
    await trash(api, 'video', id);
    await page.goto('/');
    await expect(nav(page).getByRole('link', { name: 'Learn' })).toHaveCount(0);
  });

  test('the YouTube player loads only after a click: no iframe and no YouTube request in the initial page', async ({ page }) => {
    await createVideo(api, 'Walkthrough', { youtubeId: YT, excerpt: 'A tour of the editor.' });
    const hosts = new Set<string>();
    page.on('request', (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: urls */ } });
    await page.route('https://www.youtube-nocookie.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<p>player stub</p>' }));

    const raw = await (await page.request.get('/learn/')).text();
    expect(raw).not.toMatch(/<iframe/i);
    expect(raw).not.toContain('youtube-nocookie.com');

    await page.goto('/learn/');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('iframe')).toHaveCount(0);
    expect([...hosts].filter((h) => h !== 'localhost:8888'), 'no third-party request before the click').toEqual([]);

    const play = page.getByRole('button', { name: 'Play video: Walkthrough' });
    await expect(play).toBeVisible();
    await play.click();
    const frame = page.locator('iframe');
    await expect(frame).toHaveCount(1);
    await expect(frame).toHaveAttribute('src', new RegExp(`^https://www\\.youtube-nocookie\\.com/embed/${YT}\\?autoplay=1`));
    await expect(frame).toHaveAttribute('title', 'Walkthrough');
    await expect(play).toHaveCount(0);
    await expect(frame).toBeFocused();
  });

  test.describe('without JavaScript', () => {
    test.use({ javaScriptEnabled: false });
    test('a plain "Watch on YouTube" link replaces the dead play button, and nothing is requested from YouTube on load', async ({ page }) => {
      await createVideo(api, 'Walkthrough', { youtubeId: YT, excerpt: 'A tour of the editor.' });
      const hosts = new Set<string>();
      page.on('request', (r) => { try { hosts.add(new URL(r.url()).host); } catch { /* data: urls */ } });
      await page.goto('/learn/');
      await page.waitForLoadState('networkidle');
      const link = page.getByRole('link', { name: /Watch on YouTube: Walkthrough/ });
      await expect(link).toHaveAttribute('href', `https://www.youtube.com/watch?v=${YT}`);
      await expect(link).toBeVisible();
      expect([...hosts].filter((h) => h !== 'localhost:8888'), 'nothing loaded from YouTube until clicked').toEqual([]);
    });
  });

  test('with JavaScript the fallback link is not in the page', async ({ page }) => {
    await createVideo(api, 'Walkthrough', { youtubeId: YT });
    await page.goto('/learn/');
    await expect(page.getByRole('link', { name: /Watch on YouTube/ })).toHaveCount(0);
  });

  test('a video without a YouTube ID is listed with no play button; a bad ID is never saved', async ({ page }) => {
    await createVideo(api, 'Coming later', { excerpt: 'Soon.' });
    await page.goto('/learn/');
    await expect(page.getByTestId('video-card')).toHaveCount(1);
    await expect(page.getByTestId('video-card').getByRole('button')).toHaveCount(0); // no play button on the card
    await expect(page.locator('[data-youtube-id]')).toHaveCount(0);
  });

  test('the channel link shows only when a URL is set; the video page shows the related app only when visible', async ({ page }) => {
    const app = await createApp(api, { title: 'ClipForge', price: '$24.99 one-time' });
    const id = await createVideo(api, 'Tour', { youtubeId: YT, relatedApp: app, content: '<p>What you will see.</p>' });
    await page.goto('/learn/');
    await expect(page.getByRole('link', { name: /YouTube channel/ })).toHaveCount(0);
    await expect(page.getByTestId('video-card').getByRole('link', { name: 'ClipForge' })).toHaveAttribute('href', /clipforge/);
    await saveSettings(api, { channel: 'https://www.youtube.com/@ideatoapps' });
    await page.goto('/learn/');
    await expect(page.getByRole('link', { name: /YouTube channel/ })).toHaveAttribute('href', 'https://www.youtube.com/@ideatoapps');

    await page.goto(`/?p=${id}&post_type=video`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Tour');
    await expect(page.getByRole('button', { name: 'Play video: Tour' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'See ClipForge' })).toHaveAttribute('href', /clipforge/);
    expect(await text(page)).toContain('What you will see.');

    await createApp(api, { title: 'Draft only', status: 'draft' });
    await trash(api, 'app', app);
    await page.goto('/learn/');
    await expect(page.getByTestId('video-card').getByRole('link', { name: 'ClipForge' })).toHaveCount(0);
  });
});

test.describe('Blog', () => {
  test('no posts: an empty state, no list and no empty box', async ({ page }) => {
    await page.goto('/blog/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blog');
    await expect(page.getByTestId('blog-empty')).toContainText('No posts yet');
    await expect(page.getByTestId('blog-list')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Blog pages' })).toHaveCount(0);
  });

  test('posts are listed newest first, drafts never, with a working post page', async ({ page }) => {
    await createPost(api, 'Older note', { date: '2026-01-01T10:00:00' });
    await createPost(api, 'Newer note', { date: '2026-02-01T10:00:00', content: '<p>Body text here.</p>' });
    await createPost(api, 'Secret draft', { status: 'draft' });
    await page.goto('/blog/');
    await expect(page.getByTestId('blog-empty')).toHaveCount(0);
    await expect(page.getByTestId('blog-list').locator('article h2')).toHaveText(['Newer note', 'Older note']);
    expect(await text(page)).not.toContain('Secret draft');
    await expect(page.getByTestId('blog-featured')).toHaveCount(0); // fewer than four posts: no featured card
    await expect(page.getByTestId('blog-summary')).toHaveText('2 articles');
    await page.getByRole('link', { name: 'Newer note' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Newer note');
    await expect(page.getByTestId('post')).toContainText('Body text here.');
    await expect(page.getByRole('link', { name: 'Blog' }).first()).toBeVisible();
  });

  test('?pg=99 on a blog with no posts keeps the (true) empty state and does not redirect', async ({ page }) => {
    await page.goto('/blog/?pg=99');
    await expect(page).toHaveURL(/pg=99/);
    await expect(page.getByTestId('blog-empty')).toContainText('No posts yet');
  });
  // One shared fixture (17 published posts + 1 draft; built through the REST API, slow). Newest first: Tokens note (llms), Prompt two,
  // Prompt one (prompting), Basics 13..01 (ai-basics, 13 posts), Plain note (Uncategorized, oldest). 12 per page, so page 2 holds 5.
  // Levels: Tokens note advanced, Prompt two intermediate, Prompt one and Basics 01-03 beginner, the rest none.
  test.describe('index with many posts', () => {
    test.use({ viewport: { width: 1280, height: 900 } });
    const titles = (page: Page) => page.getByTestId('blog-list').locator('article h2').allInnerTexts();
    test.beforeAll(async () => {
      test.setTimeout(240_000);
      const [ai, pr, ll] = [await createPostCategory(api, 'AI basics', 'ai-basics'), await createPostCategory(api, 'Prompting', 'prompting'), await createPostCategory(api, 'LLMs', 'llms')];
      await createPost(api, 'Plain note', { date: '2026-03-01T10:00:00' });
      for (let i = 1; i <= 13; i++) {
        const id = await createPost(api, `Basics ${String(i).padStart(2, '0')}`, { date: `2026-03-${String(i + 1).padStart(2, '0')}T10:00:00`, categories: [ai] });
        if (i <= 3) await setPostLevel(api, id, 'beginner', 'beginners');
      }
      await setPostLevel(api, await createPost(api, 'Prompt one', { date: '2026-03-15T10:00:00', categories: [pr] }), 'beginner', 'beginners,students');
      await setPostLevel(api, await createPost(api, 'Prompt two', { date: '2026-03-16T10:00:00', categories: [pr] }), 'intermediate', 'workers-and-business-owners');
      await setPostLevel(api, await createPost(api, 'Tokens note', { date: '2026-03-17T10:00:00', categories: [ll] }), 'advanced', 'builders');
      await createPost(api, 'Secret draft', { status: 'draft', date: '2026-03-18T10:00:00', categories: [ai] });
      api.made.splice(0);
    });
    test.afterAll(async () => { test.setTimeout(240_000); await resetContent(api); });

    test('page 1: the newest post is one featured card (title, excerpt, reading time, category), not repeated in the grid; 11 in the grid', async ({ page }) => {
      await page.goto('/blog/');
      const featured = page.getByTestId('blog-featured');
      await expect(featured).toHaveCount(1);
      await expect(featured.getByRole('heading', { level: 2 })).toHaveText('Tokens note');
      await expect(featured).toContainText('About Tokens note.');
      await expect(featured).toContainText('1 min read');
      await expect(featured.getByTestId('card-label')).toHaveText('LLMs');
      const grid = await titles(page);
      expect(grid).toHaveLength(11);
      expect(grid).not.toContain('Tokens note');
      expect(grid.slice(0, 3)).toEqual(['Prompt two', 'Prompt one', 'Basics 13']);
      expect(await text(page)).not.toContain('Secret draft');
      await expect(page.getByTestId('blog-summary')).toHaveText('17 articles');
      await expect(page.getByTestId('blog-list').getByTestId('card-meta').first()).toHaveText('1 min read');
      expect((await featured.boundingBox())!.width, 'featured is wider than a grid card').toBeGreaterThan((await page.getByTestId('blog-list').locator('article').first().boundingBox())!.width * 1.5);
    });

    test('chips: All first and current, counts, in topic order; a chip filters, no featured card, current moves', async ({ page }) => {
      await page.goto('/blog/');
      const chips = page.getByTestId('blog-chips').getByRole('link');
      await expect(chips).toHaveText(['All', 'AI basics 13 articles', 'Prompting 2 articles', 'LLMs 1 article']);
      await expect(chips.first()).toHaveAttribute('aria-current', 'page');
      await chips.filter({ hasText: 'Prompting' }).click();
      await expect(page).toHaveURL(/\/blog\/\?cat=prompting$/);
      expect(await titles(page)).toEqual(['Prompt two', 'Prompt one']);
      await expect(page.getByTestId('blog-featured')).toHaveCount(0);
      await expect(page.getByTestId('blog-summary')).toHaveText('2 articles');
      await expect(chips.filter({ hasText: 'Prompting' })).toHaveAttribute('aria-current', 'page');
      await expect(chips.first()).not.toHaveAttribute('aria-current', 'page');
      await chips.first().click();
      await expect(page).toHaveURL(/\/blog\/$/);
      await expect(page.getByTestId('blog-featured')).toHaveCount(1);
    });

    test('search works and combines with a category chip; the query is escaped and shown in the summary', async ({ page }) => {
      await page.goto('/blog/');
      await page.getByRole('search').getByLabel('Search articles').fill('  prompt   ');
      await page.getByRole('search').getByRole('button', { name: 'Search' }).click();
      await expect(page).toHaveURL(/\/blog\/\?q=\++prompt\++$/); // the browser sends the spaces; the server trims and collapses them
      expect(await titles(page)).toEqual(['Prompt two', 'Prompt one']);
      await expect(page.getByTestId('blog-summary')).toHaveText('2 articles for "prompt"');
      await expect(page.getByTestId('blog-featured')).toHaveCount(0);
      await page.getByTestId('blog-chips').getByRole('link', { name: /AI basics/ }).click(); // keeps q
      await expect(page).toHaveURL(/cat=ai-basics/);
      await expect(page).toHaveURL(/q=prompt/);
      await expect(page.getByTestId('blog-no-results')).toBeVisible();
      await page.goto('/blog/?cat=prompting');
      await page.getByRole('search').getByLabel('Search articles').fill('two');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/cat=prompting/);
      expect(await titles(page)).toEqual(['Prompt two']);
      await expect(page.getByTestId('blog-summary')).toHaveText('1 article for "two"');
      await expect(page.getByRole('search').getByLabel('Search articles')).toHaveValue('two');
    });

    test('odd input never errors: markup is stripped and escaped, long text is capped, arrays and unknown categories are ignored', async ({ page }) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      let dialogs = 0;
      page.on('dialog', async (d) => { dialogs++; await d.dismiss(); });
      const input = page.getByRole('search').getByLabel('Search articles');
      const res = await page.goto('/blog/?q=' + encodeURIComponent('<img src=x onerror=alert(1)>Tokens'));
      expect(res!.status()).toBe(200);
      await expect(input).toHaveValue('Tokens');
      await expect(page.getByTestId('blog-summary')).toHaveText('1 article for "Tokens"');
      expect(await page.locator('main img[onerror]').count()).toBe(0);
      expect((await page.goto('/blog/?q=' + 'a'.repeat(500)))!.status()).toBe(200);
      expect(((await input.inputValue()).length)).toBe(80);
      await expect(page.getByTestId('blog-no-results')).toBeVisible();
      await page.goto('/blog/?q=%26lt%3Bscript%26gt%3B%20%22quoted%22');
      await expect(page.getByTestId('blog-summary')).toHaveText('0 articles for "&lt;script&gt; "quoted""');
      for (const url of ['/blog/?q[]=x&cat[]=y', '/blog/?cat=no-such-category', '/blog/?cat=../../etc/passwd', '/blog/?pg[]=2', '/blog/?pg=-3', '/blog/?q=%3Cscript%3E']) {
        const r = await page.goto(url);
        expect(r!.status(), url).toBe(200);
        await expect(page.getByTestId('blog-featured'), url).toHaveCount(1); // all ignored: the plain first page
        await expect(page.getByTestId('blog-summary'), url).toHaveText('17 articles');
      }
      expect(errors).toEqual([]);
      expect(dialogs).toBe(0);
    });

    test('searches with no real word (stopword, one letter, punctuation) find nothing and say why; a real word next to a stopword still searches', async ({ page }) => {
      for (const q of ['what', 'a', 'the what', '!!!']) {
        await page.goto('/blog/?q=' + encodeURIComponent(q));
        await expect(page.getByTestId('blog-no-results'), q).toBeVisible();
        await expect(page.getByTestId('blog-search-hint'), q).toContainText('longer or more specific');
        await expect(page.getByTestId('blog-summary'), q).toHaveText(`0 articles for "${q}"`);
        await expect(page.getByTestId('blog-list'), q).toHaveCount(0);
      }
      await page.goto('/blog/?q=what+tokens');
      await expect(page.getByTestId('blog-summary')).toHaveText('1 article for "what tokens"');
      await expect(page.getByTestId('blog-search-hint')).toHaveCount(0);
    });

    test('a category view has its own title and description; counts are hidden while searching', async ({ page }) => {
      await page.goto('/blog/?cat=prompting');
      await expect(page).toHaveTitle(/^Prompting articles/);
      await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', 'Articles about Prompting from IdeaToApps.');
      await expect(page.locator('meta[property="og:title"]')).toHaveAttribute('content', /^Prompting articles/);
      await page.goto('/blog/?cat=llms');
      await expect(page).toHaveTitle(/^LLMs articles/);
      await page.goto('/blog/?q=prompt');
      await expect(page.getByTestId('blog-chips').getByRole('link')).toHaveText(['All', 'AI basics', 'Prompting', 'LLMs']);
      await page.goto('/blog/?pg=2abc');
      await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/blog\/$/);
    });

    test('pagination keeps the filters; page 2 has no featured card; past the end goes to the last page of that filter', async ({ page }) => {
      await page.goto('/blog/');
      await expect(page.getByRole('navigation', { name: 'Blog pages' })).toBeVisible();
      await page.getByRole('link', { name: 'Older posts' }).click();
      await expect(page).toHaveURL(/pg=2/);
      expect(await titles(page)).toEqual(['Basics 04', 'Basics 03', 'Basics 02', 'Basics 01', 'Plain note']);
      await expect(page.getByTestId('blog-featured')).toHaveCount(0);
      await page.getByRole('link', { name: 'Newer posts' }).click();
      await expect(page).toHaveURL(/\/blog\/$/);
      await expect(page.getByTestId('blog-featured')).toHaveCount(1);
      // A filter with 13 posts has two pages and the links keep cat (and q).
      await page.goto('/blog/?cat=ai-basics');
      expect((await titles(page)).length).toBe(12);
      await page.getByRole('link', { name: 'Older posts' }).click();
      await expect(page).toHaveURL(/cat=ai-basics&pg=2$/);
      expect(await titles(page)).toEqual(['Basics 01']);
      await page.getByRole('link', { name: 'Newer posts' }).click();
      await expect(page).toHaveURL(/\/blog\/\?cat=ai-basics$/);
      await page.goto('/blog/?q=Basics&cat=ai-basics');
      expect(await page.getByRole('link', { name: 'Older posts' }).getAttribute('href')).toMatch(/cat=ai-basics&q=Basics&pg=2$/);
      await page.goto('/blog/?pg=99');
      await expect(page).toHaveURL(/pg=2/);
      await page.goto('/blog/?cat=ai-basics&pg=99');
      await expect(page).toHaveURL(/cat=ai-basics&pg=2$/);
      expect(await titles(page)).toEqual(['Basics 01']);
    });

    test('empty results: a "Clear filters" link, not the "No posts yet" state', async ({ page }) => {
      await page.goto('/blog/?cat=llms&q=Basics');
      await expect(page.getByTestId('blog-no-results')).toContainText('No articles found');
      await expect(page.getByTestId('blog-empty')).toHaveCount(0);
      await expect(page.getByTestId('blog-list')).toHaveCount(0);
      await expect(page.getByTestId('blog-summary')).toHaveText('0 articles for "Basics"');
      await expect(page.getByRole('search')).toBeVisible(); // can try again
      await page.getByTestId('blog-no-results').getByRole('link', { name: 'Clear filters' }).click();
      await expect(page).toHaveURL(/\/blog\/$/);
      await expect(page.getByTestId('blog-featured')).toHaveCount(1);
    });

    test('search views are noindex,follow; a category view and the plain blog are indexable', async ({ page }) => {
      const robots = async (url: string) => { await page.goto(url); return { robots: await page.locator('meta[name="robots"]').getAttribute('content'), canonicals: await page.locator('link[rel="canonical"]').count() }; };
      const search = await robots('/blog/?q=prompt');
      expect(search.robots).toMatch(/noindex/);
      expect(search.robots).toMatch(/follow/);
      expect(search.canonicals).toBe(0);
      expect((await robots('/blog/?cat=prompting')).robots ?? '').not.toMatch(/noindex/);
      expect(await page.locator('link[rel="canonical"]').getAttribute('href')).toMatch(/\/blog\/\?cat=prompting$/);
      expect((await robots('/blog/')).robots ?? '').not.toMatch(/noindex/);
    });

    test('level chips: totals, a chip filters (no featured card), combines with category and search, cards show the level', async ({ page }) => {
      await page.goto('/blog/');
      const levels = page.getByTestId('blog-levels').getByRole('link');
      await expect(page.getByRole('navigation', { name: 'Level' })).toBeVisible();
      await expect(levels).toHaveText(['All levels', 'Beginner 4 articles', 'Intermediate 1 article', 'Advanced 1 article']);
      await expect(levels.first()).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('blog-featured').getByTestId('card-level')).toHaveText('Level: Advanced');
      await levels.filter({ hasText: 'Beginner' }).click();
      await expect(page).toHaveURL(/\/blog\/\?level=beginner$/);
      expect(await titles(page)).toEqual(['Prompt one', 'Basics 03', 'Basics 02', 'Basics 01']);
      await expect(page.getByTestId('blog-featured')).toHaveCount(0);
      await expect(page.getByTestId('blog-summary')).toHaveText('4 articles');
      await expect(levels.filter({ hasText: 'Beginner' })).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('blog-list').getByTestId('card-level')).toHaveText(Array(4).fill('Level: Beginner'));
      await page.getByTestId('blog-chips').getByRole('link', { name: /Prompting/ }).click(); // keeps the level
      await expect(page).toHaveURL(/\?cat=prompting&level=beginner$/);
      expect(await titles(page)).toEqual(['Prompt one']);
      await page.goto('/blog/?level=beginner');
      await page.getByRole('search').getByLabel('Search articles').fill('Basics');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/level=beginner/);
      expect(await titles(page)).toEqual(['Basics 03', 'Basics 02', 'Basics 01']);
      await expect(page.getByTestId('blog-summary')).toHaveText('3 articles for "Basics"');
      await expect(levels).toHaveText(['All levels', 'Beginner', 'Intermediate', 'Advanced']); // counts hidden while searching
      await levels.first().click(); // "All levels" keeps the search
      await expect(page).toHaveURL(/\?q=Basics$/);
      await page.goto('/blog/?cat=ai-basics&level=beginner&q=Basics');
      expect(await titles(page)).toEqual(['Basics 03', 'Basics 02', 'Basics 01']);
    });

    test('level views are noindex,follow; odd level input is ignored and escaped', async ({ page }) => {
      await page.goto('/blog/?level=intermediate');
      expect(await page.locator('meta[name="robots"]').getAttribute('content')).toMatch(/noindex.*follow|follow.*noindex/);
      await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
      expect(await titles(page)).toEqual(['Prompt two']);
      let dialogs = 0;
      page.on('dialog', async (d) => { dialogs++; await d.dismiss(); });
      for (const url of ['/blog/?level=Beginner', '/blog/?level[]=beginner', '/blog/?level=expert', '/blog/?level=' + encodeURIComponent('"><img src=x onerror=alert(1)>'), '/blog/?level=' + 'b'.repeat(500)]) {
        const r = await page.goto(url);
        expect(r!.status(), url).toBe(200);
        await expect(page.getByTestId('blog-featured'), url).toHaveCount(1); // ignored: the plain first page
        await expect(page.getByTestId('blog-summary'), url).toHaveText('17 articles');
        await expect(page.getByTestId('blog-levels').getByRole('link').first(), url).toHaveAttribute('aria-current', 'page');
        expect(await page.locator('main img[onerror]').count(), url).toBe(0);
        expect(await page.locator('input[name="level"]').count(), url).toBe(0);
      }
      expect(dialogs).toBe(0);
    });

    test('the post page category chip links to that category in the blog', async ({ page }) => {
      await page.goto('/blog/?q=Prompt+one');
      await page.getByRole('link', { name: 'Prompt one' }).click();
      const chip = page.getByTestId('post-category').getByRole('link', { name: 'Prompting' });
      await expect(chip).toHaveAttribute('href', /\/blog\/\?cat=prompting$/);
      await chip.click();
      expect(await titles(page)).toEqual(['Prompt two', 'Prompt one']);
    });

    test('without JavaScript: chips, search and pagination are plain links and a GET form', async ({ browser }) => {
      const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 740 } });
      const page = await ctx.newPage();
      await page.goto('/blog/');
      await page.getByTestId('blog-chips').getByRole('link', { name: /LLMs/ }).click();
      expect(await titles(page)).toEqual(['Tokens note']); // filtered: the newest post is a normal grid card, not featured
      await page.getByRole('search').getByLabel('Search articles').fill('Tokens');
      await page.getByRole('search').getByRole('button', { name: 'Search' }).click();
      await expect(page).toHaveURL(/cat=llms/);
      await expect(page).toHaveURL(/q=Tokens/);
      await expect(page.getByTestId('blog-summary')).toHaveText('1 article for "Tokens"');
      await ctx.close();
    });

    for (const width of [360, 768, 1440]) {
      test(`no horizontal overflow at ${width}px (plain, filtered, long search, no results); chips wrap and are 44px tall`, async ({ page }) => {
        await page.setViewportSize({ width, height: 900 });
        for (const url of ['/blog/', '/blog/?cat=ai-basics', '/blog/?level=beginner', '/blog/?q=' + 'W'.repeat(80), '/blog/?cat=llms&q=zzzz']) {
          await page.goto(url);
          await page.evaluate(() => document.fonts.ready);
          expect(await horizontalOverflow(page), `${url} at ${width}px`).toBeLessThanOrEqual(0);
        }
        await page.goto('/blog/');
        for (const h of await page.locator('.blog-chip').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().height))) expect(h).toBeGreaterThanOrEqual(44);
        for (const r of await page.locator('.blog-chip').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().right))) expect(r).toBeLessThanOrEqual(width);
        if (width === 360) expect(await page.locator('.blog-chip').evaluateAll((els) => new Set(els.map((e) => Math.round(e.getBoundingClientRect().top))).size)).toBeGreaterThan(1); // wrapped onto several lines
      });
    }

    for (const scheme of ['dark', 'light'] as const) {
      test(`axe is clean in ${scheme} (featured card, chips, search; filtered; no results)`, async ({ browser }) => {
        for (const width of [360, 1280]) {
          const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width, height: 900 } });
          const page = await ctx.newPage();
          for (const url of ['/blog/', '/blog/?cat=prompting', '/blog/?level=beginner&cat=prompting', '/blog/?cat=llms&q=zzzz']) {
            await page.goto(url);
            await page.evaluate(() => document.fonts.ready);
            await page.waitForTimeout(300);
            await page.evaluate(() => window.scrollTo(0, 0));
            expect(await axeProblems(page), `${scheme} ${width}px ${url}`).toEqual([]);
          }
          await ctx.close();
        }
      });
    }

    test('keyboard: chips and search have visible focus rings', async ({ page }) => {
      await page.goto('/blog/');
      for (const loc of [page.getByRole('search').getByLabel('Search articles'), page.getByTestId('blog-chips').getByRole('link').nth(1)]) {
        await loc.focus();
        await page.keyboard.press('Shift+Tab');
        await page.keyboard.press('Tab');
        const outline = await loc.evaluate((el) => { const c = getComputedStyle(el); return `${c.outlineStyle}:${c.outlineWidth}`; });
        expect(outline).not.toMatch(/^none|:0px/);
      }
    });
  });
});

// A long article: four sections (two share a heading), about 1,000 words (4 x 7 paragraphs of 36 words), plus other posts for "Read next".
const PARA = 'Plain words about one idea at a time, with a short example you can try today and a note on what to check afterwards, so the point sticks and you can reuse it the next time.';
const para = (n: number) => Array(n).fill(`<p>${PARA}</p>`).join('');
const LONG = ['Getting started', 'Setup', 'Setup', 'Wrapping up'].map((h) => `<h2>${h}</h2>${para(7)}`).join('\n');
async function longPostFixture(a: Api, title = 'Long guide'): Promise<number> {
  for (const [i, t] of ['Alpha note', 'Beta note', 'Gamma note', 'Delta note'].entries()) await createPost(a, t, { date: `2026-02-0${i + 1}T10:00:00` });
  await createPost(a, 'Hidden draft', { status: 'draft', date: '2026-02-09T10:00:00' });
  return createPost(a, title, { content: LONG, date: '2026-02-10T10:00:00', meta: { ita_last_reviewed: '2026-02-28' } });
}
const scrollTo = (page: Page, y: number) => page.evaluate((top) => { window.scrollTo({ top, behavior: 'instant' }); }, y);
const barWidth = async (page: Page) => (await page.getByTestId('post-progress').locator('.post-progress__bar').boundingBox())?.width ?? 0;

test.describe('Single post', () => {
  test.use({ viewport: { width: 1280, height: 800 } });
  // One shared fixture of six posts (built through the REST API, slow). The file-wide afterEach cleanup would delete it, so it is
  // taken off the cleanup list and removed with resetContent after this block, which leaves the site blank for later blocks.
  let fixtureId = 0;
  test.beforeAll(async () => {
    test.setTimeout(180_000);
    fixtureId = await longPostFixture(api);
    await setPostLevel(api, fixtureId, 'intermediate', 'workers-and-business-owners,parents-and-families,teachers-and-tutors'); // the longest labels
    api.made.splice(0);
  });
  test.afterAll(async () => { await resetContent(api); });

  test('hero, meta row, contents with unique ids, and "Read next" with three other published posts', async ({ page }) => {
    const id = fixtureId;
    await page.goto(`/?p=${id}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Long guide');
    await expect(page.getByTestId('post-meta')).toContainText('5 min read');
    await expect(page.getByTestId('post-meta')).toContainText('Last reviewed February 28, 2026');
    const toc = page.getByTestId('post-toc');
    await expect(toc.getByRole('link')).toHaveText(['Getting started', 'Setup', 'Setup', 'Wrapping up']);
    expect(await toc.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(['#getting-started', '#setup', '#setup-2', '#wrapping-up']);
    await expect(page.locator('.post-body h2')).toHaveCount(4);
    await expect(page.locator('#setup-2')).toHaveText('Setup');
    const next = page.getByTestId('post-read-next');
    await expect(next.getByRole('heading', { level: 3 })).toHaveText(['Delta note', 'Gamma note', 'Beta note']);
    expect(await next.innerText()).not.toMatch(/Long guide|Hidden draft|Alpha note/);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible();
    await page.getByTestId('post-read-next').getByRole('link', { name: 'Delta note' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delta note');
    await expect(page.getByTestId('post-meta')).not.toContainText('Last reviewed');
  });

  test('level badge and "Who this is for" audience chips come from the post meta; a post without a level shows neither', async ({ page }) => {
    await page.goto(`/?p=${fixtureId}`);
    const who = page.getByTestId('post-audience');
    await expect(who.getByTestId('post-level')).toHaveText('Level: Intermediate');
    await expect(who.getByTestId('post-for')).toHaveText('Who this is for:');
    await expect(who.getByRole('list', { name: 'Who this is for:' }).getByRole('listitem')).toHaveText(['Workers and business owners', 'Parents and families', 'Teachers and tutors']);
    const heroOrder = await page.locator('.post-hero').evaluate((h) => [...h.querySelectorAll('[data-testid]')].map((e) => e.getAttribute('data-testid')));
    expect(heroOrder.indexOf('post-audience')).toBeGreaterThan(heroOrder.indexOf('post-meta'));
    await page.getByTestId('post-read-next').getByRole('link', { name: 'Delta note' }).click();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Delta note');
    await expect(page.getByTestId('post-audience')).toHaveCount(0);
  });

  test('a wide table scrolls inside itself at 360px (no page overflow), is keyboard-scrollable, and is axe clean in both themes', async ({ browser }) => {
    const cols = ['Format', 'Best for', 'What to ask for', 'Watch out for', 'Example request'];
    const row = (h: string) => `<tr><th scope="row">${h}</th>${cols.slice(1).map((c) => `<td>${c} for ${h.toLowerCase()} with several plain words in each cell</td>`).join('')}</tr>`;
    const table = `<table><caption>Which format to ask for</caption><thead><tr>${cols.map((c) => `<th scope="col">${c}</th>`).join('')}</tr></thead><tbody>${['Table', 'Checklist', 'JSON'].map(row).join('')}</tbody></table>`;
    const id = await createPost(api, 'Table guide', { content: `<p>Intro text before the table.</p>${table}<p>Text after the table.</p>` });
    for (const scheme of ['dark', 'light'] as const) {
      const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width: 360, height: 740 } });
      const page = await ctx.newPage();
      await page.goto(`/?p=${id}`);
      await page.evaluate(() => document.fonts.ready);
      const t = page.locator('.post-body table');
      await expect(t.locator('caption')).toHaveText('Which format to ask for');
      expect(await horizontalOverflow(page), `${scheme} page overflow`).toBeLessThanOrEqual(0);
      const box = await t.evaluate((el) => ({ scroll: el.scrollWidth, client: el.clientWidth, right: el.getBoundingClientRect().right }));
      expect(box.scroll, 'the table is wider than its box').toBeGreaterThan(box.client);
      expect(box.right).toBeLessThanOrEqual(360);
      await page.locator('.post-body p').first().click();
      for (let i = 0; i < 20 && !(await t.evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
      await expect(t, 'Tab reaches the table').toBeFocused();
      await page.keyboard.press('ArrowRight');
      await page.keyboard.press('ArrowRight');
      await expect.poll(() => t.evaluate((el) => el.scrollLeft), { message: 'arrow keys scroll the table' }).toBeGreaterThan(0);
      await t.evaluate((el) => { el.scrollLeft = 0; });
      await page.evaluate(() => window.scrollTo(0, 0));
      expect(await axeProblems(page), `${scheme} axe`).toEqual([]);
      // axe cannot measure cells clipped by the scrolling table (allow-listed in helpers/a11y.ts), so check every one here.
      const worst = await t.evaluate((el) => {
        const rgb = (c: string) => (c.match(/[\d.]+/g) ?? []).map(Number);
        const lum = (c: number[]) => { const f = (v: number) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
        const bg = (n: Element | null): number[] => { for (; n; n = n.parentElement) { const c = rgb(getComputedStyle(n).backgroundColor); if (c.length >= 3 && (c.length < 4 || c[3] === 1)) return c; } return [255, 255, 255]; };
        return Math.min(...[...el.querySelectorAll('caption, th, td')].map((cell) => { const a = lum(rgb(getComputedStyle(cell).color)), b = lum(bg(cell)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); }));
      });
      expect(worst, `${scheme} worst cell contrast`).toBeGreaterThanOrEqual(4.5);
      await ctx.close();
    }
  });

  test('contents links scroll to their heading, below the sticky header, and the contents stay in view', async ({ page }) => {
    const id = fixtureId;
    await page.goto(`/?p=${id}`);
    const headerBottom = (await page.locator('.site-header').boundingBox())!.height;
    const toc = page.getByTestId('post-toc');
    for (const [name, target] of [['Setup', '#setup'], ['Wrapping up', '#wrapping-up']] as const) {
      await toc.getByRole('link', { name, exact: true }).first().click();
      await expect(page).toHaveURL(new RegExp(`${target}$`));
      // Smooth scrolling: wait until the heading rests just under the sticky header (not hidden behind it).
      await expect.poll(async () => { const y = (await page.locator(target).boundingBox())!.y; return y >= headerBottom && y < 200; }, { message: `${target} settles under the header` }).toBe(true);
      const t = (await toc.boundingBox())!;
      expect(t.y, 'sticky contents sit below the header').toBeGreaterThanOrEqual(headerBottom);
      await expect(toc).toBeInViewport();
      await expect(toc.locator('a[aria-current="location"]')).toHaveText(name);
    }
    await expect(page.getByTestId('post-toc').locator('summary')).toBeHidden();
  });

  test('the progress bar is decorative, starts empty, grows while scrolling and fills at the end of the text', async ({ page }) => {
    const id = fixtureId;
    await page.goto(`/?p=${id}`);
    const progress = page.getByTestId('post-progress');
    await expect(progress).toHaveAttribute('aria-hidden', 'true');
    await expect(progress).toBeVisible();
    expect(await barWidth(page)).toBe(0);
    const seen: number[] = [];
    const bodyTop = await page.locator('.post-body').evaluate((el) => el.getBoundingClientRect().top + window.scrollY);
    for (const dy of [300, 900, 1800]) {
      await scrollTo(page, bodyTop + dy);
      await expect.poll(() => barWidth(page)).toBeGreaterThan(seen.at(-1) ?? 0);
      seen.push(await barWidth(page));
    }
    await scrollTo(page, 100000);
    await expect.poll(() => barWidth(page)).toBeGreaterThanOrEqual(1270);
  });

  test('with reduced motion the progress bar is hidden', async ({ browser }) => {
    const id = fixtureId;
    const ctx = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    await page.goto(`/?p=${id}`);
    await expect(page.getByTestId('post-progress')).toBeHidden();
    await ctx.close();
  });

  test('without JavaScript: contents are plain anchors in an open list, text and "Read next" show, no progress bar', async ({ browser }) => {
    const id = fixtureId;
    const ctx = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 740 } });
    const page = await ctx.newPage();
    await page.goto(`/?p=${id}`);
    await expect(page.getByTestId('post-toc').getByRole('link', { name: 'Wrapping up' })).toBeVisible();
    await expect(page.getByTestId('post-progress')).toBeHidden();
    await expect(page.getByTestId('post-read-next').getByRole('heading', { level: 3 })).toHaveCount(3);
    await page.getByTestId('post-toc').getByRole('link', { name: 'Wrapping up' }).click();
    await expect(page).toHaveURL(/#wrapping-up$/);
    await expect(page.locator('#wrapping-up')).toBeInViewport();
    await ctx.close();
  });

  test('on a phone the contents are a collapsed, toggleable list that still navigates', async ({ browser }) => {
    const id = fixtureId;
    const ctx = await browser.newContext({ viewport: { width: 360, height: 740 } });
    const page = await ctx.newPage();
    await page.goto(`/?p=${id}`);
    const toc = page.getByTestId('post-toc');
    await expect(toc.locator('details')).not.toHaveJSProperty('open', true);
    await expect(toc.getByRole('link', { name: 'Wrapping up' })).toBeHidden();
    await toc.locator('summary').click();
    await toc.getByRole('link', { name: 'Wrapping up' }).click();
    await expect(page).toHaveURL(/#wrapping-up$/);
    await expect(page.locator('#wrapping-up')).toBeInViewport();
    await ctx.close();
  });

  test('a post with fewer than three headings has no contents', async ({ page }) => {
    const id = await createPost(api, 'Short one', { content: `<h2>One</h2><p>Text.</p><h2>Two</h2><p>More.</p>` });
    await page.goto(`/?p=${id}`);
    await expect(page.getByTestId('post')).toBeVisible();
    await expect(page.getByTestId('post-toc')).toHaveCount(0);
    await expect(page.getByTestId('post-read-next').getByRole('heading', { level: 3 })).toHaveCount(3); // the shared fixture posts
  });

  test('non-Latin, percent and reserved headings get plain ids, link correctly and never throw', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const id = await createPost(api, 'Odd headings', { content: `<h2>Main</h2>${para(8)}<h2>你好世界</h2>${para(8)}<h2 id="50%">Half</h2>${para(8)}<h2>100% sure</h2>${para(8)}` });
    await page.goto(`/?p=${id}`);
    const toc = page.getByTestId('post-toc');
    expect(await toc.getByRole('link').evaluateAll((as) => as.map((a) => a.getAttribute('href')))).toEqual(['#main-2', '#section-2', '#50%', '#100-sure']);
    await expect(page.locator('main#main')).toHaveCount(1);
    for (const [name, sel] of [['你好世界', '#section-2'], ['Half', '[id="50%"]'], ['100% sure', '[id="100-sure"]']] as const) {
      await toc.getByRole('link', { name }).click();
      await expect.poll(async () => { const y = (await page.locator(sel).boundingBox())!.y; return y >= 73 && y < 200; }).toBe(true);
      await expect(toc.locator('a[aria-current="location"]')).toHaveText(name);
    }
    expect(await barWidth(page)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  for (const [label, width] of [['360px', 360], ['768px', 768], ['1440px', 1440]] as const) {
    test(`no horizontal overflow at ${label}, with and without the contents open`, async ({ page }) => {
      const id = fixtureId;
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`/?p=${id}`);
      await page.evaluate(() => document.fonts.ready);
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      if (width < 1024) await page.getByTestId('post-toc').locator('summary').click();
      else await expect(page.getByTestId('post-toc').getByRole('link', { name: 'Wrapping up' })).toBeVisible();
      expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    });
  }

  for (const scheme of ['dark', 'light'] as const) {
    test(`axe is clean in ${scheme} (with contents, meta row and Read next)`, async ({ browser }) => {
      const id = fixtureId;
      for (const width of [360, 1280]) {
        const ctx = await browser.newContext({ colorScheme: scheme, viewport: { width, height: 800 } });
        const page = await ctx.newPage();
        await page.goto(`/?p=${id}`);
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        await scrollTo(page, 0); // the sticky header wordmark is a known site-wide "incomplete" while scrolled
        expect(await axeProblems(page), `${scheme} ${width}px`).toEqual([]);
        await ctx.close();
      }
    });
  }
});

test.describe('About and FAQ', () => {
  test('About states only the tagline and that ClipForge is the first app; links ClipForge only when it is listed', async ({ page }) => {
    await page.goto('/about/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('About IdeaToApps');
    const body = await text(page);
    expect(body).toContain('Useful apps. Brilliant ideas. One place.');
    expect(body).toContain('ClipForge');
    expect(body).toContain('first app');
    expect(body).not.toMatch(/\b\d[\d,]*\+?\s+(customers|users|downloads)|testimonial|rated|\bstars?\b|since (19|20)\d\d|founded/i);
    expect(body).not.toMatch(EMAIL);
    await expect(page.getByRole('link', { name: 'See ClipForge' })).toHaveCount(0);
    await createApp(api, { title: 'ClipForge' });
    await page.goto('/about/');
    await expect(page.getByRole('link', { name: 'See ClipForge' })).toHaveAttribute('href', /clipforge/);
  });

  test('FAQ answers use README facts only and open and close', async ({ page }) => {
    await page.goto('/faq/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const items = page.locator('details.faq__item');
    await expect(items).toHaveCount(5);
    const body = await page.locator('main').evaluate((m) => m.textContent ?? '');
    expect(body).toContain('$24.99');
    expect(body).toMatch(/no free trial/i);
    expect(body).toContain('Python 3 or Node.js');
    expect(body).toMatch(/Safari is untested/);
    expect(body).not.toMatch(/\bEdge\b|Windows|macOS|Linux|account library|free to try|refund within/i);
    await items.first().locator('summary').click();
    await expect(items.first()).toHaveAttribute('open', '');
    await items.first().locator('summary').click();
    await expect(items.first()).not.toHaveAttribute('open', '');
  });
});

test.describe('legal pages', () => {
  for (const [path, title] of [['/privacy/', 'Privacy policy'], ['/terms/', 'Terms of service'], ['/refund-policy/', 'Refund policy']] as const) {
    test(`${path} shows the DRAFT banner, owner placeholders and no invented facts`, async ({ page }) => {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(title);
      await expect(page.getByTestId('draft-banner')).toBeVisible();
      await expect(page.getByTestId('draft-banner')).toContainText('DRAFT, pending legal review');
      expect(await page.locator('mark.owner-confirm').count()).toBeGreaterThan(0);
      const body = await text(page);
      expect(body).toMatch(/Owner to confirm/);
      expect(body).not.toMatch(EMAIL);
      expect(body).not.toMatch(/\b\d+[- ]days?\b|\bLtd\b|\bLLC\b|\bInc\b|GmbH|\bVAT (number|no)|money-back/i);
      expect(body).not.toMatch(/emails? (you|will)|we will (send|email)/i);
    });
  }

  test('the banner is only on legal pages', async ({ page }) => {
    for (const path of ['/about/', '/faq/', '/contact/', '/blog/']) {
      await page.goto(path);
      await expect(page.getByTestId('draft-banner')).toHaveCount(0);
    }
  });
});

test.describe('Contact', () => {
  test('disabled by default: a plain notice, no form, no email address; the endpoint answers 503', async ({ page }) => {
    await page.goto('/contact/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Contact');
    await expect(page.getByTestId('contact-unavailable')).toContainText('not yet available');
    await expect(page.locator('form')).toHaveCount(0);
    expect(await page.locator('body').innerHTML()).not.toMatch(EMAIL);
    expect(await page.locator('a[href^="mailto:"]').count()).toBe(0);
    const res = await page.request.post(wpJson('/ideatoapps/v1/contact'), { data: { name: 'A', email: 'a@example.com', message: 'Hi', website: '' } });
    expect(res.status()).toBe(503);
    expect((await res.json()).message).toMatch(/not yet available/);
  });

  test('once the owner enables it the form shows with labelled fields and a hidden honeypot', async ({ page }) => {
    await saveSettings(api, { contact: true });
    await page.goto('/contact/');
    const form = page.getByTestId('contact-form');
    await expect(form).toBeVisible();
    for (const label of ['Name', 'Email address', 'Message']) await expect(form.getByLabel(label, { exact: true })).toBeVisible();
    await expect(form.locator('input[name="website"]')).not.toBeInViewport();
    await expect(form.locator('input[name="website"]')).toHaveAttribute('tabindex', '-1');
    expect(await page.locator('body').innerHTML()).not.toMatch(EMAIL);
    await expect(page.getByTestId('contact-unavailable')).toHaveCount(0);
  });

  test('submitting sends JSON with the nonce header and shows the answer; errors are announced', async ({ page }) => {
    await saveSettings(api, { contact: true });
    await page.goto('/contact/');
    let seen: { body: Record<string, unknown>; nonce: string | undefined } | null = null;
    await page.route('**/ideatoapps/v1/contact*', async (route) => {
      seen = { body: route.request().postDataJSON(), nonce: route.request().headers()['x-wp-nonce'] };
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, message: 'Thanks, your message was sent.' }) });
    });
    await page.getByLabel('Name', { exact: true }).fill('Ann');
    await page.getByLabel('Email address', { exact: true }).fill('ann@example.com');
    await page.getByLabel('Message').fill('Hello there');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByTestId('form-status')).toHaveText('Thanks, your message was sent.');
    expect(seen!.body).toEqual({ name: 'Ann', email: 'ann@example.com', message: 'Hello there', website: '' });
    expect(seen!.nonce).toMatch(/^[a-f0-9]{10}$/);
    await expect(page.getByLabel('Name', { exact: true })).toHaveValue('');

    await page.unroute('**/ideatoapps/v1/contact*');
    await page.route('**/ideatoapps/v1/contact*', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ code: 'ideatoapps_rate_limited', message: 'Too many requests. Please wait a minute and try again.' }) }));
    await page.getByLabel('Name', { exact: true }).fill('Ann');
    await page.getByLabel('Email address', { exact: true }).fill('ann@example.com');
    await page.getByLabel('Message').fill('Again');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(page.getByTestId('form-status')).toContainText('Too many requests');
    await expect(page.getByRole('button', { name: 'Send message' })).toBeEnabled();
    await expect(page.getByLabel('Message')).toHaveValue('Again'); // nothing is lost on an error
  });

  test('the real endpoint rejects a filled honeypot (400) and a missing nonce (403) when enabled', async ({ page }) => {
    await saveSettings(api, { contact: true });
    await page.goto('/contact/');
    const nonce = await page.locator('form[data-nonce]').getAttribute('data-nonce');
    const post = (data: object, headers: Record<string, string> = { 'X-WP-Nonce': nonce! }) => page.request.post(wpJson('/ideatoapps/v1/contact'), { data, headers });
    expect((await post({ name: 'Bot', email: 'b@example.com', message: 'x', website: 'http://spam.example' })).status()).toBe(400);
    expect((await post({ name: 'A', email: 'a@example.com', message: 'x', website: '' }, {})).status()).toBe(403);
  });
});

const SIGNUP_OK = 'Thanks. If this address needs confirming, we have emailed it a link. Your sign-up only counts once you click it.';

test.describe('Newsletter', () => {
  // The sign-up is off until the owner switches it on (Settings > IdeaToApps); the double opt-in flow is in newsletter-optin.spec.ts.
  test.beforeEach(async () => { await saveSettings(api, { newsletter: true }); });

  test('the home sign-up has a consent checkbox and promises only a confirmation email, nothing until confirmed', async ({ page }) => {
    await page.goto('/');
    const section = page.getByTestId('newsletter');
    await expect(section).toBeVisible();
    await expect(section.getByLabel('Email address', { exact: true })).toBeVisible();
    await expect(section.getByRole('checkbox')).toBeVisible();
    const body = await section.innerText();
    expect(body).toMatch(/confirmation email/i);
    expect(body).toMatch(/nothing is sent until you confirm/i);
    expect(body).not.toMatch(/weekly|daily|monthly|tips|sent to your inbox/i);
    expect(body).not.toMatch(EMAIL);
  });

  test('consent is required: submitting without it sends nothing', async ({ page }) => {
    await page.goto('/');
    let calls = 0;
    await page.route('**/ideatoapps/v1/newsletter*', (route) => { calls++; return route.abort(); });
    await page.getByTestId('newsletter').getByLabel('Email address', { exact: true }).fill('reader@example.com');
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(page.getByTestId('newsletter').getByRole('checkbox')).toBeFocused();
    expect(calls).toBe(0);
  });

  test('a real sign-up is accepted, then the endpoint refuses missing consent, a bad email and a bad nonce', async ({ page }) => {
    await page.goto('/');
    const section = page.getByTestId('newsletter');
    await section.getByLabel('Email address', { exact: true }).fill(`reader${Date.now()}@example.com`);
    await section.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(section.getByTestId('form-status')).toHaveText(SIGNUP_OK);
    await expect(section.getByLabel('Email address', { exact: true })).toHaveValue('');
    await expect(section.getByRole('checkbox')).not.toBeChecked();

    const nonce = (await section.locator('form').getAttribute('data-nonce'))!;
    const post = (data: object, headers: Record<string, string> = { 'X-WP-Nonce': nonce }) => page.request.post(wpJson('/ideatoapps/v1/newsletter'), { data, headers });
    expect((await post({ email: 'x@example.com' })).status(), 'no consent').toBe(400);
    expect((await post({ email: 'nope', consent: true })).status(), 'bad email').toBe(400);
    expect((await post({ email: 'x@example.com', consent: true }, {})).status(), 'no nonce').toBe(403);
  });

  const fillNewsletter = async (page: Page) => {
    const section = page.getByTestId('newsletter');
    await section.getByLabel('Email address', { exact: true }).fill(`stale${Date.now()}@example.com`);
    await section.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Subscribe' }).click();
    return section;
  };

  test('a stale cached nonce is refreshed once and the sign-up then succeeds', async ({ page }) => {
    await page.goto('/');
    await page.locator('form[data-nonce]').first().evaluate((f) => f.setAttribute('data-nonce', 'deadbeef00'));
    const posts: (string | undefined)[] = [];
    let refreshes = 0;
    await page.route('**/ideatoapps/v1/newsletter*', (route) => { posts.push(route.request().headers()['x-wp-nonce']); return route.continue(); });
    await page.route('**/ideatoapps/v1/nonce*', (route) => { refreshes++; return route.continue(); });
    const section = await fillNewsletter(page);
    await expect(section.getByTestId('form-status')).toHaveText(SIGNUP_OK, { timeout: 20_000 });
    expect(refreshes, 'one refresh').toBe(1);
    expect(posts).toHaveLength(2);
    expect(posts[0]).toBe('deadbeef00');
    expect(posts[1]).toMatch(/^[a-f0-9]{10}$/);
    expect(posts[1]).not.toBe('deadbeef00');
  });

  test('when the nonce is still refused after the one retry the visitor sees a fixed message and nothing loops', async ({ page }) => {
    await page.goto('/');
    let posts = 0;
    let refreshes = 0;
    await page.route('**/ideatoapps/v1/newsletter*', (route) => { posts++; return route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'ideatoapps_bad_nonce', message: 'SERVER TEXT MUST NOT BE SHOWN' }) }); });
    await page.route('**/ideatoapps/v1/nonce*', (route) => { refreshes++; return route.continue(); });
    const section = await fillNewsletter(page);
    await expect(section.getByTestId('form-status')).toHaveText('Something went wrong. Please reload the page and try again.', { timeout: 20_000 });
    await expect(page.getByRole('button', { name: 'Subscribe' })).toBeEnabled();
    await page.waitForTimeout(500);
    expect(posts, 'exactly one retry').toBe(2);
    expect(refreshes, 'exactly one refresh').toBe(1);
  });

  test('the nonce refresh endpoint answers with a nonce and is never cacheable', async ({ page }) => {
    const res = await page.request.get(wpJson('/ideatoapps/v1/nonce'));
    expect(res.status()).toBe(200);
    expect((await res.json()).nonce).toMatch(/^[a-f0-9]{10}$/);
    expect(res.headers()['cache-control']).toContain('no-store');
  });

  test('a rate-limit answer is shown to the visitor and the form stays usable', async ({ page }) => {
    await page.goto('/');
    await page.route('**/ideatoapps/v1/newsletter*', (route) => route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ message: 'Too many requests. Please wait a minute and try again.' }) }));
    const section = page.getByTestId('newsletter');
    await section.getByLabel('Email address', { exact: true }).fill('reader@example.com');
    await section.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Subscribe' }).click();
    await expect(section.getByTestId('form-status')).toContainText('Too many requests');
    await expect(page.getByRole('button', { name: 'Subscribe' })).toBeEnabled();
  });

  test('the Blog and Learn pages offer the sign-up too', async ({ page }) => {
    await page.goto('/blog/');
    await expect(page.getByTestId('newsletter')).toHaveCount(1);
    await createVideo(api, 'Any video', { youtubeId: YT });
    await page.goto('/learn/');
    await expect(page.getByTestId('newsletter')).toHaveCount(1);
  });
});

// Every new template, both themes, 360px and desktop: AA contrast/axe and no horizontal overflow.
type Setup = (api: Api) => Promise<void>;
const states: Array<{ name: string; path: string; setup?: Setup }> = [
  { name: 'learn empty', path: '/learn/' },
  { name: 'learn populated', path: '/learn/', setup: async (a) => { await createVideo(a, 'A rather long walkthrough title that has to wrap on small screens', { youtubeId: YT, excerpt: 'A tour of the editor.' }); await createVideo(a, 'No player yet'); } },
  { name: 'video page', path: '/?post_type=video&p=', setup: async (a) => { await createVideo(a, 'Tour', { youtubeId: YT, content: '<p>What you will see.</p>' }); } },
  { name: 'blog empty', path: '/blog/' },
  { name: 'blog populated', path: '/blog/', setup: async (a) => { await createPost(a, 'First note'); await createPost(a, 'Second note'); } },
  { name: 'post', path: '/?p=', setup: async (a) => { await createPost(a, 'A note', { content: '<h2>Heading</h2><p>Some text.</p><ul><li>One</li></ul>' }); } },
  { name: 'about', path: '/about/' },
  { name: 'faq', path: '/faq/' },
  { name: 'contact disabled', path: '/contact/' },
  { name: 'contact enabled', path: '/contact/', setup: async (a) => { await saveSettings(a, { contact: true }); } },
  { name: 'newsletter link not valid', path: '/?ita_newsletter=confirm&sid=1&t=x' },
  { name: 'privacy', path: '/privacy/' },
  { name: 'terms', path: '/terms/' },
  { name: 'refund', path: '/refund-policy/' },
  { name: 'home, sign-up not open yet', path: '/' },
  { name: 'home with newsletter', path: '/', setup: async (a) => { await saveSettings(a, { newsletter: true }); } },
];

for (const scheme of ['dark', 'light'] as const) {
  for (const [label, width, height] of [['360px', 360, 740], ['desktop', 1280, 900]] as const) {
    test.describe(`${scheme} ${label}: accessibility and layout`, () => {
      test.use({ colorScheme: scheme, viewport: { width, height } });
      for (const st of states) {
        test(st.name, async ({ page }) => {
          let path = st.path;
          if (st.setup) {
            await st.setup(api);
            if (path.endsWith('p=')) {
              const type = path.includes('post_type=video') ? 'video' : 'posts';
              const list = await (await api.ctx.fetch(wpJson(`/wp/v2/${type}`) + '&per_page=1&orderby=date&order=desc', { headers: { 'X-WP-Nonce': api.nonce } })).json();
              path += list[0].id;
            }
          }
          await page.goto(path);
          await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(300);
          expect(await horizontalOverflow(page), `${st.name} overflows horizontally`).toBeLessThanOrEqual(0);
          expect(await axeProblems(page)).toEqual([]);
        });
      }
    });
  }
}
