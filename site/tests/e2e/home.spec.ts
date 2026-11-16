import { test, expect, type Page } from '@playwright/test';
import { axeProblems } from './helpers/a11y';
import { horizontalOverflow } from './helpers/layout';
import { parseColor, sampleBackground, worstRatio } from './helpers/contrast';
import { adminApi, cleanup, createApp, createCategory, createVideo, resetContent, saveSettings, trash, uploadImage, type Api } from './helpers/wp';

// These tests change site content; the server is shared, so run them one at a time and leave the site blank.
test.describe.configure({ mode: 'serial' });

let api: Api;
test.beforeAll(async () => { api = await adminApi(); await resetContent(api); });
test.afterEach(async ({}, info) => { if (!info.titlePath.some((t) => t.includes('theme, fully populated'))) await cleanup(api); });
test.afterAll(async () => { await resetContent(api); });

const CLIPFORGE = { title: 'ClipForge', price: '$24.99 one-time', tagline: 'Edit video in your browser. Nothing leaves your computer.' };
const SECTIONS = ['hero', 'featured-apps', 'categories', 'how-it-works', 'watch-learn', 'newsletter'];
const present = async (page: Page) => {
  const out: string[] = [];
  for (const id of SECTIONS) if ((await page.getByTestId(id).count()) > 0) out.push(id);
  return out;
};

test.describe('hero', () => {
  test('shows the tagline, one h1 and Explore apps; no Watch demos without a video', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Useful apps. Brilliant ideas. One place.');
    const hero = page.getByTestId('hero');
    await expect(hero.getByRole('link', { name: 'Explore apps' })).toHaveAttribute('href', /\/apps\/$/);
    await expect(page.getByRole('link', { name: 'Watch demos' })).toHaveCount(0);
    await expect(hero.locator('.hero__lead')).not.toBeEmpty();
  });

  test('Watch demos appears only once a video is published, and goes to /learn/', async ({ page }) => {
    const draft = await createVideo(api, 'Draft demo', { status: 'draft' });
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Watch demos' })).toHaveCount(0);
    const id = await createVideo(api, 'ClipForge walkthrough');
    await page.goto('/');
    await expect(page.getByTestId('hero').getByRole('link', { name: 'Watch demos' })).toHaveAttribute('href', /\/learn\/$/);
    await trash(api, 'video', id);
    await page.goto('/');
    await expect(page.getByRole('link', { name: 'Watch demos' })).toHaveCount(0);
    expect(draft).toBeGreaterThan(0);
  });
});

test.describe('featured apps', () => {
  test('lists ClipForge with its price and never the word Free; absent again once trashed', async ({ page }) => {
    const id = await createApp(api, CLIPFORGE);
    await page.goto('/');
    const section = page.getByTestId('featured-apps');
    await expect(section.getByRole('heading', { level: 2 })).toBeVisible();
    const card = section.locator('article.card').filter({ hasText: 'ClipForge' });
    await expect(card).toHaveCount(1);
    await expect(card).toContainText('$24.99 one-time');
    await expect(card).toContainText(CLIPFORGE.tagline);
    await expect(card.getByRole('link', { name: 'ClipForge' })).toHaveAttribute('href', /\/(apps\/clipforge\/|\?app=clipforge)/);
    expect(await page.getByTestId('featured-apps').innerText()).not.toMatch(/free/i);
    await expect(card).not.toContainText('Coming soon');

    await trash(api, 'app', id);
    await page.goto('/');
    await expect(page.getByTestId('featured-apps')).toHaveCount(0);
    expect(await page.locator('main').innerText()).not.toContain('ClipForge');
  });

  test('with zero published apps the featured section is absent, not empty', async ({ page }) => {
    await createApp(api, { title: 'Unpublished', status: 'draft' });
    await createApp(api, { title: 'Hidden', delivery: 'draft' });
    await page.goto('/');
    await expect(page.getByTestId('featured-apps')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /featured/i })).toHaveCount(0);
    expect(await page.locator('main').innerText()).not.toMatch(/Unpublished|Hidden/);
  });

  test('coming soon shows the label and no price; drafts and private apps never appear', async ({ page }) => {
    await createApp(api, { title: 'Soon App', delivery: 'coming_soon', price: '$9.99 one-time' });
    await createApp(api, { title: 'Draft App', status: 'draft' });
    await createApp(api, { title: 'Private App', status: 'private' });
    await createApp(api, { title: 'Delivery Draft App', delivery: 'draft' });
    await page.goto('/');
    const section = page.getByTestId('featured-apps');
    const soon = section.locator('article.card').filter({ hasText: 'Soon App' });
    await expect(soon).toContainText('Coming soon');
    await expect(soon).not.toContainText('$');
    await expect(section.locator('article.card')).toHaveCount(1);
  });

  test('the featured setting picks and orders apps; otherwise the latest apps show', async ({ page }) => {
    const a = await createApp(api, { title: 'Alpha', price: '$1.00 one-time' });
    const b = await createApp(api, { title: 'Bravo', price: '$2.00 one-time' });
    const c = await createApp(api, { title: 'Charlie', price: '$3.00 one-time' });
    const d = await createApp(api, { title: 'Draftie', status: 'draft' });
    await page.goto('/');
    await expect(page.getByTestId('featured-apps').locator('.card__title')).toHaveText(['Charlie', 'Bravo', 'Alpha']);

    await saveSettings(api, { featured: [c, a, d] });
    await page.goto('/');
    // The same order as the list on the settings page (by title), whatever order they were chosen in.
    await expect(page.getByTestId('featured-apps').locator('.card__title')).toHaveText(['Alpha', 'Charlie']);
    expect(b).toBeGreaterThan(0);
  });

  test('app images carry width, height and lazy loading', async ({ page }) => {
    const media = await uploadImage(api);
    await createApp(api, { ...CLIPFORGE, media });
    await page.goto('/');
    const imgs = page.getByTestId('featured-apps').locator('img');
    await expect(imgs).toHaveCount(1);
    await expect(imgs.first()).toHaveAttribute('width', /\d+/);
    await expect(imgs.first()).toHaveAttribute('height', /\d+/);
    await expect(imgs.first()).toHaveAttribute('loading', 'lazy');
    await expect(imgs.first()).toHaveAttribute('alt', '');
  });
});

test.describe('categories', () => {
  test('only categories with a published, visible app appear and link to their archive', async ({ page }) => {
    const tools = await createCategory(api, 'Creative tools');
    await createCategory(api, 'Empty category');
    const onlyDraft = await createCategory(api, 'Drafts only');
    await createApp(api, { ...CLIPFORGE, categories: [tools] });
    await createApp(api, { title: 'Hidden', status: 'draft', categories: [onlyDraft] });
    await page.goto('/');
    const section = page.getByTestId('categories');
    await expect(section.getByRole('link')).toHaveCount(1);
    await expect(section.getByRole('link', { name: /Creative tools/ })).toHaveAttribute('href', /apps\/category\/creative-tools|app_category=creative-tools/);
    await expect(section).not.toContainText('Empty category');
    await expect(section).not.toContainText('Drafts only');
  });

  test('absent when no category has an app', async ({ page }) => {
    await createCategory(api, 'Empty category');
    await createApp(api, CLIPFORGE);
    await page.goto('/');
    await expect(page.getByTestId('categories')).toHaveCount(0);
    await expect(page.getByText('Empty category')).toHaveCount(0);
  });
});

test.describe('how it works', () => {
  test('four honest steps, no trial or demo claim', async ({ page }) => {
    await page.goto('/');
    const section = page.getByTestId('how-it-works');
    await expect(section.locator('ol > li h3')).toHaveText(['Discover', 'Watch', 'Buy once', 'Download and run']);
    const text = await section.innerText();
    expect(text).not.toMatch(/\btry\b|trial|free/i);
  });
});

test.describe('watch and learn', () => {
  test('absent with no videos, even when a channel URL is set', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('watch-learn')).toHaveCount(0);
    await saveSettings(api, { channel: 'https://www.youtube.com/@ideatoapps' });
    await page.goto('/');
    await expect(page.getByTestId('watch-learn')).toHaveCount(0);
    await expect(page.locator('a[href*="youtube.com"]')).toHaveCount(0);
  });

  test('lists published videos, links the channel only when set, and loads no third party', async ({ page }) => {
    await createVideo(api, 'ClipForge walkthrough');
    await createVideo(api, 'Hidden draft', { status: 'draft' });
    const hosts = new Set<string>();
    page.on('request', (r) => { if (/^https?:/.test(r.url())) hosts.add(new URL(r.url()).host); });
    await page.goto('/');
    const section = page.getByTestId('watch-learn');
    await expect(section.getByRole('heading', { level: 2 })).toBeVisible();
    await expect(section.locator('article.card')).toHaveCount(1);
    await expect(section).toContainText('ClipForge walkthrough');
    await expect(section).not.toContainText('Hidden draft');
    await expect(section.locator('a[href*="youtube.com"]')).toHaveCount(0);

    await saveSettings(api, { channel: 'https://www.youtube.com/@ideatoapps' });
    await page.goto('/');
    const link = page.getByTestId('watch-learn').getByRole('link', { name: /YouTube/ });
    await expect(link).toHaveAttribute('href', 'https://www.youtube.com/@ideatoapps');
    await expect(link).toHaveAttribute('rel', /noopener/);
    await page.waitForLoadState('networkidle');
    expect([...hosts]).toEqual(['localhost:8888']);
  });
});

test.describe('newsletter', () => {
  test('present since Task 7 added the endpoint (details in content.spec.ts); with a consent checkbox once the owner turns it on', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('newsletter')).toContainText('Sign-up is not open yet');
    await expect(page.getByTestId('newsletter').locator('input')).toHaveCount(0);
    await saveSettings(api, { newsletter: true });
    await page.goto('/');
    await expect(page.getByTestId('newsletter')).toHaveCount(1);
    await expect(page.getByTestId('newsletter').locator('input[type="email"]')).toHaveCount(1);
    await expect(page.getByTestId('newsletter').getByRole('checkbox')).toHaveCount(1);
  });
});

test.describe('page structure', () => {
  test('sections are in order and the page has one h1 when fully populated', async ({ page }) => {
    const cat = await createCategory(api, 'Creative tools');
    await createApp(api, { ...CLIPFORGE, categories: [cat] });
    await createVideo(api, 'ClipForge walkthrough');
    await page.goto('/');
    expect(await present(page)).toEqual(['hero', 'featured-apps', 'categories', 'how-it-works', 'watch-learn', 'newsletter']);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    // headings never skip a level and each section is labelled by its heading
    const levels = await page.locator('main :is(h1,h2,h3,h4)').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    for (const id of ['featured-apps', 'categories', 'how-it-works', 'watch-learn']) {
      const label = await page.getByTestId(id).getAttribute('aria-labelledby');
      await expect(page.locator(`#${label}`)).toHaveCount(1);
    }
    const order = await page.locator('main > [data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    expect(order).toEqual(['hero', 'featured-apps', 'categories', 'how-it-works', 'watch-learn', 'newsletter']);
  });

  test('empty site shows only the hero and how it works', async ({ page }) => {
    await page.goto('/');
    expect(await present(page)).toEqual(['hero', 'how-it-works', 'newsletter']);
    await expect(page.locator('main a[href=""], main a:not([href])')).toHaveCount(0);
  });
});

for (const theme of ['dark', 'light'] as const) {
  test.describe(`${theme} theme, fully populated`, () => {
    test.use({ colorScheme: theme });

    // One fixture set for the whole describe: every request costs ~1 s on the sandbox.
    test.beforeAll(async () => {
      const cat = await createCategory(api, 'Creative tools');
      const media = await uploadImage(api);
      await createApp(api, { ...CLIPFORGE, categories: [cat], media });
      await createApp(api, { title: 'A much longer app name that has to wrap on small screens', delivery: 'coming_soon', tagline: 'Another useful idea that is on its way to the store soon.' });
      await createVideo(api, 'ClipForge walkthrough: from import to MP4 export in a few minutes', { media });
      await saveSettings(api, { channel: 'https://www.youtube.com/@ideatoapps' });
    });
    test.afterAll(async () => { await cleanup(api); });

    for (const w of [360, 390, 768, 1024, 1440]) {
      test(`no horizontal overflow at ${w}px`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto('/');
        await expect(page.getByTestId('watch-learn')).toBeVisible();
        expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
      });
    }

    for (const w of [360, 1440]) {
      test(`axe: no serious/critical violations and no unverified contrast at ${w}px`, async ({ page }) => {
        await page.setViewportSize({ width: w, height: 900 });
        await page.goto('/');
        await expect(page.getByTestId('watch-learn')).toBeVisible();
        expect(await axeProblems(page)).toEqual([]);
      });
    }

    test('hero text over the glow keeps its contrast with a video published (pixel sampled)', async ({ page }) => {
      test.setTimeout(300_000);
      // Ten fresh loads per width: the glow must not depend on load timing.
      for (const [width, load] of [1440, 390].flatMap((w) => Array.from({ length: 10 }, (_, i) => [w, i] as const))) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto('/');
        await page.waitForTimeout(450);
        const hero = page.getByTestId('hero');
        for (const [name, loc, min] of [
          ['Watch demos', hero.getByRole('link', { name: 'Watch demos' }), 4.5],
          ['lead', hero.locator('.hero__lead'), 5.2],
          ['eyebrow', hero.locator('.section-heading__eyebrow'), 5.2],
          ['h1', hero.getByRole('heading', { level: 1 }), 3],
        ] as const) {
          const fg = parseColor(await loc.evaluate((el) => getComputedStyle(el).color));
          expect(worstRatio(fg, await sampleBackground(page, loc)), `${name} at ${width}px, load ${load}`).toBeGreaterThanOrEqual(min);
        }
      }
    });
  });
}
