import { test, expect, type Page } from '@playwright/test';
import { axeProblems } from './helpers/a11y';
import { horizontalOverflow } from './helpers/layout';
import { adminApi, cleanup, createApp, createCategory, resetContent, type Api } from './helpers/wp';

// These tests change site content; the server is shared, so run them one at a time and leave the site blank.
test.describe.configure({ mode: 'serial' });

let api: Api;
test.beforeAll(async () => { api = await adminApi(); await resetContent(api); });
test.afterAll(async () => { await resetContent(api); });

const cards = (page: Page) => page.getByTestId('catalog-results').locator('article.card');
const titles = (page: Page) => page.getByTestId('catalog-results').locator('.card__title');

test.describe('empty catalog', () => {
  test('with no apps at all it says so honestly, with no cards, no fake apps and no Clear filters', async ({ page }) => {
    await page.goto('/apps/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Apps');
    const empty = page.getByTestId('catalog-empty');
    await expect(empty).toContainText('No apps yet');
    await expect(page.locator('article.card')).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Clear filters' })).toHaveCount(0);
    await expect(page.getByTestId('catalog-filters')).toHaveCount(0);
  });

  test('only hidden apps (draft, delivery draft, private) still counts as no apps', async ({ page }) => {
    await createApp(api, { title: 'Draft post', status: 'draft' });
    await createApp(api, { title: 'Hidden delivery', delivery: 'draft' });
    await createApp(api, { title: 'Private app', status: 'private' });
    await page.goto('/apps/');
    await expect(page.getByTestId('catalog-empty')).toContainText('No apps yet');
    expect(await page.locator('main').innerText()).not.toMatch(/Draft post|Hidden delivery|Private app/);
    await cleanup(api);
  });
});

test.describe('populated catalog', () => {
  let ids: number[] = [];
  test.beforeAll(async () => {
    const creator = await createCategory(api, 'Creator');
    const utilities = await createCategory(api, 'Utilities');
    await createCategory(api, 'Unused');
    ids = [
      await createApp(api, { title: 'ClipForge', price: '$24.99 one-time', tagline: 'Edit videos in your browser.', categories: [creator] }),
      await createApp(api, { title: 'Budget Buddy', price: '$9.00 one-time', tagline: 'Track what you spend.', categories: [utilities] }),
      await createApp(api, { title: 'Zen Timer', delivery: 'coming_soon', price: '$5.00 one-time', tagline: 'Focus sessions.', categories: [utilities] }),
      await createApp(api, { title: 'Secret draft', status: 'draft', categories: [creator] }),
      await createApp(api, { title: 'Secret delivery', delivery: 'draft', categories: [creator] }),
    ];
  });
  test.afterAll(async () => { await cleanup(api); });

  test('lists only published live or coming soon apps, newest first, with price or Coming soon', async ({ page }) => {
    await page.goto('/apps/');
    await expect(titles(page)).toHaveText(['Zen Timer', 'Budget Buddy', 'ClipForge']);
    expect(await page.locator('main').innerText()).not.toMatch(/Secret/);
    await expect(cards(page).filter({ hasText: 'ClipForge' })).toContainText('$24.99 one-time');
    const soon = cards(page).filter({ hasText: 'Zen Timer' });
    await expect(soon).toContainText('Coming soon');
    await expect(soon).not.toContainText('$');
    await expect(page.getByTestId('catalog-count')).toHaveText('3 apps');
    await expect(page.getByRole('link', { name: 'Clear filters' })).toHaveCount(0);
    await expect(page.getByTestId('catalog-empty')).toHaveCount(0);
  });

  test('sort=title orders A-Z and the sort control reflects the URL', async ({ page }) => {
    await page.goto('/apps/?sort=title');
    await expect(titles(page)).toHaveText(['Budget Buddy', 'ClipForge', 'Zen Timer']);
    await expect(page.getByLabel('Sort by')).toHaveValue('title');
    await page.goto('/apps/?sort=bogus');
    await expect(page.getByLabel('Sort by')).toHaveValue('newest');
    await expect(titles(page)).toHaveText(['Zen Timer', 'Budget Buddy', 'ClipForge']);
  });

  test('search updates the URL, filters, and the back button restores the previous state', async ({ page }) => {
    await page.goto('/apps/');
    await page.getByLabel('Search apps').fill('clip');
    await expect(page).toHaveURL(/[?&]s=clip(&|$)/);
    await expect(titles(page)).toHaveText(['ClipForge']);
    await expect(page.getByTestId('catalog-count')).toHaveText('1 app');
    await page.goBack();
    await expect(page).not.toHaveURL(/s=clip/);
    await expect(titles(page)).toHaveText(['Zen Timer', 'Budget Buddy', 'ClipForge']);
    await expect(page.getByLabel('Search apps')).toHaveValue('');
    await page.goForward();
    await expect(titles(page)).toHaveText(['ClipForge']);
    await expect(page.getByLabel('Search apps')).toHaveValue('clip');
  });

  test('category filter updates the URL and works with the keyboard; back restores', async ({ page }) => {
    await page.goto('/apps/');
    const select = page.getByLabel('Category');
    await expect(select.locator('option')).toHaveText(['All categories', 'Creator', 'Utilities']); // no empty or draft-only category
    await select.focus();
    await select.selectOption('utilities');
    await expect(page).toHaveURL(/[?&]category=utilities(&|$)/);
    await expect(titles(page)).toHaveText(['Zen Timer', 'Budget Buddy']);
    await expect(select).toHaveValue('utilities');
    await page.goBack();
    await expect(titles(page)).toHaveText(['Zen Timer', 'Budget Buddy', 'ClipForge']);
    await expect(select).toHaveValue('');
  });

  test('filters combine, and a deep link restores every control', async ({ page }) => {
    await page.goto('/apps/?s=budget&category=utilities&sort=title');
    await expect(titles(page)).toHaveText(['Budget Buddy']);
    await expect(page.getByLabel('Search apps')).toHaveValue('budget');
    await expect(page.getByLabel('Category')).toHaveValue('utilities');
    await expect(page.getByLabel('Sort by')).toHaveValue('title');
    await page.goto('/apps/?s=budget&category=creator');
    await expect(page.getByTestId('catalog-empty')).toContainText('No apps match');
  });

  test('works with plain GET and no JavaScript', async ({ browser }) => {
    const ctx = await browser.newContext({ javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto('/apps/?category=utilities&sort=title');
    await expect(titles(page)).toHaveText(['Budget Buddy', 'Zen Timer']);
    await page.getByLabel('Search apps').fill('zen');
    await page.getByRole('button', { name: 'Apply filters' }).click();
    await expect(page).toHaveURL(/s=zen/);
    await expect(titles(page)).toHaveText(['Zen Timer']);
    await ctx.close();
  });

  test('zero results shows an empty state with a Clear filters link that resets everything', async ({ page }) => {
    await page.goto('/apps/?s=nothing-matches&category=creator&sort=title');
    await expect(cards(page)).toHaveCount(0);
    const empty = page.getByTestId('catalog-empty');
    await expect(empty).toContainText('No apps match');
    await expect(page.getByTestId('catalog-count')).toHaveText('0 apps');
    const clear = empty.getByRole('link', { name: 'Clear filters' });
    await expect(clear).toHaveAttribute('href', /\/apps\/$/);
    await clear.click();
    await expect(page).toHaveURL(/\/apps\/$/);
    await expect(cards(page)).toHaveCount(3);
    await expect(page.getByLabel('Search apps')).toHaveValue('');
  });

  test('unknown category is a zero-result state, not an error or a silent full list', async ({ page }) => {
    await page.goto('/apps/?category=does-not-exist');
    await expect(page.getByTestId('catalog-empty')).toContainText('No apps match');
    await expect(cards(page)).toHaveCount(0);
  });

  test('user input is escaped (no script runs, the text shows literally)', async ({ page }) => {
    let dialog = false;
    page.on('dialog', async (d) => { dialog = true; await d.dismiss(); });
    const evil = '"><img src=x onerror=alert(1)><script>alert(2)</script>';
    await page.goto(`/apps/?s=${encodeURIComponent(evil)}&category=${encodeURIComponent(evil)}&sort=${encodeURIComponent(evil)}`);
    await expect(page.getByLabel('Search apps')).toHaveValue('">'); // tags stripped on input, the rest escaped into the attribute
    await expect(page.locator('input[name="s"]')).toHaveCount(1);
    await page.waitForTimeout(300);
    expect(dialog).toBe(false);
    await expect(page.locator('main img[src="x"]')).toHaveCount(0);
  });

  test('the old taxonomy URL lands on the catalog filtered by that category', async ({ page }) => {
    await page.goto('/apps/category/utilities/');
    await expect(page).toHaveURL(/\/apps\/\?category=utilities/);
    await expect(titles(page)).toHaveText(['Zen Timer', 'Budget Buddy']);
  });

  test('app cards link to the app page', async ({ page }) => {
    await page.goto('/apps/');
    await cards(page).filter({ hasText: 'ClipForge' }).getByRole('link', { name: 'ClipForge' }).click();
    await expect(page).toHaveURL(/\/apps\/clipforge\/$/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('ClipForge');
  });

  test('the catalog page has one h1, labelled landmarks and no unnamed links', async ({ page }) => {
    await page.goto('/apps/');
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.getByRole('search')).toHaveCount(1);
    const levels = await page.locator('main :is(h1,h2,h3,h4)').evaluateAll((els) => els.map((e) => Number(e.tagName[1])));
    for (let i = 1; i < levels.length; i++) expect(levels[i] - levels[i - 1]).toBeLessThanOrEqual(1);
    await expect(page.locator('main a:not([href]), main a[href=""]')).toHaveCount(0);
  });

  for (const theme of ['dark', 'light'] as const) {
    test.describe(`${theme} theme`, () => {
      test.use({ colorScheme: theme });
      for (const w of [360, 390, 768, 1024, 1440]) {
        for (const [name, url] of [['populated', '/apps/'], ['zero results', '/apps/?s=zzzz']] as const) {
          test(`no horizontal overflow at ${w}px (${name})`, async ({ page }) => {
            await page.setViewportSize({ width: w, height: 900 });
            await page.goto(url);
            await expect(page.locator('[data-testid="catalog-results"], [data-testid="catalog-empty"]').first()).toBeVisible();
            expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
          });
        }
      }
      for (const w of [360, 1440]) {
        for (const [name, url] of [['populated', '/apps/'], ['zero results', '/apps/?s=zzzz']] as const) {
          test(`axe: no serious/critical violations and no unverified contrast at ${w}px (${name})`, async ({ page }) => {
            await page.setViewportSize({ width: w, height: 900 });
            await page.goto(url);
            await expect(page.locator('[data-testid="catalog-results"], [data-testid="catalog-empty"]').first()).toBeVisible();
            expect(await axeProblems(page)).toEqual([]);
          });
        }
      }
    });
  }
  void ids;
});

test.describe('pagination', () => {
  test.beforeAll(async () => {
    test.setTimeout(240_000); // 13 admin-form saves at ~5 s each exceed the default 60 s hook timeout on a slow machine
    for (let i = 1; i <= 13; i++) await createApp(api, { title: `Numbered app ${String(i).padStart(2, '0')}`, tagline: `App number ${i}` });
  });
  test.afterAll(async () => { await cleanup(api); });

  test('12 per page, a stable order across pages, and filters survive paging', async ({ page }) => {
    await page.goto('/apps/');
    await expect(cards(page)).toHaveCount(12);
    const first = (await titles(page).allTextContents()).map((t) => t.trim());
    const nav = page.getByRole('navigation', { name: 'Pagination' });
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: /Next/ }).click();
    await expect(page).toHaveURL(/\/apps\/page\/2\//);
    await expect(cards(page)).toHaveCount(1);
    const second = (await titles(page).allTextContents()).map((t) => t.trim());
    expect(new Set([...first, ...second]).size).toBe(13);
    await expect(nav.getByRole('link', { name: /Previous/ })).toBeVisible();

    await page.goto('/apps/?sort=title');
    await expect(titles(page)).toHaveText(Array.from({ length: 12 }, (_, i) => `Numbered app ${String(i + 1).padStart(2, '0')}`));
    await page.getByRole('navigation', { name: 'Pagination' }).getByRole('link', { name: /Next/ }).click();
    await expect(page).toHaveURL(/sort=title/);
    await expect(titles(page)).toHaveText(['Numbered app 13']);
  });

  test('a page past the end is a real 404 (WordPress core), never a "No apps match your filters" box', async ({ page }) => {
    for (const path of ['/apps/?paged=999', '/apps/page/999/', '/apps/?sort=title&paged=999', '/apps/?s=app&paged=999']) {
      const res = await page.goto(path);
      expect(res?.status(), path).toBe(404);
      await expect(page.getByTestId('catalog-empty'), path).toHaveCount(0);
      await expect(page.getByRole('heading', { level: 1 }), path).toContainText(/could not be found/i);
    }
    await page.goto('/apps/?s=zzznothingmatches'); // a real empty search on page 1 stays honest
    await expect(page.getByTestId('catalog-empty')).toContainText('No apps match your filters');
  });

  test('no pagination with 12 or fewer matches', async ({ page }) => {
    await page.goto('/apps/?s=app+number+3');
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toHaveCount(0);
  });
});
