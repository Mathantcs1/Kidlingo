import { test, expect, type Page } from '@playwright/test';
import { axeProblems } from './helpers/a11y';
import { horizontalOverflow } from './helpers/layout';
import { parseColor, ratio, type RGB } from './helpers/contrast';
import { adminApi, cleanup, createPost, resetContent, signOffAndPublish, type Api } from './helpers/wp';

// Original inline SVG art: diagrams in articles, generated heroes on the post and on blog cards.
test.describe.configure({ mode: 'serial' });

const FIGURES = ['agent-loop', 'chatbot-answer-flow', 'token-splitting', 'context-window', 'training-stages', 'chatbot-workflow-agent', 'tool-calling', 'agent-memory', 'guardrail-approval-flow', 'eval-loop', 'prompt-recipe', 'open-vs-closed'];
const ALT = (n: string) => `Diagram: ${n.replace(/-/g, ' ')}`;
const CONTENT = `<p>Intro.</p>\n[ita_why title="More detail"]Some detail.\n\n[ita_figure name="agent-loop" alt="${ALT('agent-loop')}" caption="Caption for the loop."]\n[/ita_why]\n` +
  FIGURES.map((n) => `[ita_figure name="${n}" alt="${ALT(n)}" caption="Figure ${n}."]`).join('\n\n') +
  '\n\n[ita_figure name="no-such-figure" alt="Hidden"]\n\n[ita_figure name="agent-loop"]\n\n<p>After the figures.</p>';

let api: Api;
let postUrl = '';
let plainUrl = '';

test.beforeAll(async () => {
  api = await adminApi();
  await resetContent(api);
  const id = await createPost(api, 'Figure fixture', { status: 'draft', content: CONTENT, meta: { ita_starter_slug: '01-what-ai-is-and-isnt' } });
  await signOffAndPublish(api, id); // starter posts cannot be published without a human sign-off
  const plain = await createPost(api, 'Plain fixture', { content: '<p>No art here.</p>' });
  postUrl = `/?p=${id}`;
  plainUrl = `/?p=${plain}`;
});
test.afterAll(async () => { await cleanup(api); await resetContent(api); });

const open = async (page: Page, url: string, theme: 'dark' | 'light' = 'dark') => {
  await page.addInitScript((t) => { try { localStorage.setItem('ideatoapps-theme', t); } catch { /* OS setting */ } }, theme);
  await page.goto(url);
  await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
};

test('figures render with caption and an accessible name; bad ones render nothing', async ({ page }) => {
  await open(page, postUrl);
  const figs = page.getByTestId('ita-figure');
  await expect(figs).toHaveCount(13); // 12 + the one inside the Why box; unknown name and missing alt print nothing
  await expect(page.getByRole('img', { name: ALT('agent-loop') }).first()).toBeAttached();
  const loop = figs.nth(1);
  await loop.scrollIntoViewIfNeeded();
  await expect(loop).toBeVisible();
  await expect(loop.locator('figcaption')).toHaveText('Figure agent-loop.');
  await expect(loop.getByRole('img', { name: ALT('agent-loop') })).toBeVisible();
  await expect(loop.locator('svg')).toHaveAttribute('viewBox', /^0 0 360 \d+$/);
  const main = await page.locator('main').innerText();
  expect(main).not.toMatch(/\[ita_figure|Hidden|Warning:|Notice:/);
  // colours really come from the CSS variables: the loop's first box is painted (not black, not none)
  const fill = await loop.locator('rect').first().evaluate((el) => getComputedStyle(el).fill);
  expect(fill).toMatch(/^rgb\(/);
  expect(fill).not.toBe('rgb(0, 0, 0)');
  // inside the Why box
  await page.getByTestId('ita-why').getByText('More detail').click();
  await expect(page.getByTestId('ita-why').getByTestId('ita-figure').getByRole('img', { name: ALT('agent-loop') })).toBeVisible();
});

test('hero: on the post (decorative, 16:9) and on the blog card; plain posts get neither', async ({ page }) => {
  await open(page, postUrl);
  const hero = page.getByTestId('post-hero');
  await expect(hero).toBeVisible();
  const svg = hero.locator('svg');
  await expect(svg).toHaveAttribute('aria-hidden', 'true');
  await expect(hero.getByRole('img')).toHaveCount(0);
  const b = (await svg.boundingBox())!;
  expect(Math.abs(b.width / b.height - 16 / 9)).toBeLessThan(0.02);
  await page.goto(plainUrl);
  await expect(page.getByTestId('post-hero')).toHaveCount(0);
  await page.goto('/blog/');
  const card = page.getByTestId('card-hero');
  await expect(card).toHaveCount(1); // only the starter post has art
  await expect(card).toBeVisible();
  const cb = (await card.boundingBox())!;
  expect(Math.abs(cb.width / cb.height - 16 / 9)).toBeLessThan(0.03);
  await expect(page.getByTestId('blog-list').locator('article')).toHaveCount(2);
});

test('no layout shift: the card hero keeps its box with CSS-sized SVG', async ({ page }) => {
  await open(page, '/blog/');
  const heights = await page.getByTestId('card-hero').evaluate((el) => [el.getBoundingClientRect().height, (el.firstElementChild as SVGElement).getBoundingClientRect().height]);
  expect(Math.abs(heights[0] - heights[1])).toBeLessThan(1.5);
});

for (const w of [360, 768, 1440]) {
  test(`no horizontal overflow at ${w}px on the post and the blog`, async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: `http://localhost:${process.env.WP_PORT ?? '8888'}`, viewport: { width: w, height: 900 } });
    const page = await ctx.newPage();
    for (const u of [postUrl, '/blog/']) {
      await page.goto(u);
      await page.waitForLoadState('networkidle');
      expect(await horizontalOverflow(page), u).toBeLessThanOrEqual(0);
    }
    if (w === 360) { // legible when scaled: every figure text renders at 14px or more
      await page.goto(postUrl);
      await page.getByTestId('ita-why').getByText('More detail').click();
      const sizes = await page.locator('.ita-figure svg text').evaluateAll((els) => els.map((e) => ({ t: e.textContent ?? '', px: (e as unknown as SVGGraphicsElement).getScreenCTM()!.a * parseFloat(getComputedStyle(e).fontSize) })));
      expect(sizes.length).toBeGreaterThan(60);
      for (const x of sizes) expect(x.px, `"${x.t}" renders at ${x.px.toFixed(1)}px`).toBeGreaterThanOrEqual(14);
    }
    await ctx.close();
  });
}

for (const theme of ['dark', 'light'] as const) {
  test(`text inside every figure has at least 4.5:1 contrast, ${theme} theme`, async ({ page }) => {
    await open(page, postUrl, theme);
    await page.getByTestId('ita-why').getByText('More detail').click();
    const rows = await page.locator('.ita-figure').evaluateAll((figs) => {
      const out: Array<{ t: string; fg: string; bg: string }> = [];
      for (const fig of figs) {
        const figBg = getComputedStyle(fig).backgroundColor;
        for (const text of fig.querySelectorAll('svg text')) {
          const r = text.getBoundingClientRect();
          const stack = document.elementsFromPoint(r.left + r.width / 2, r.top + r.height / 2).filter((e) => e !== text && fig.contains(e) && e.tagName !== 'text');
          const under = stack.find((e) => e.tagName === 'rect' || e.tagName === 'path') as SVGElement | undefined;
          const f = under ? getComputedStyle(under).fill : 'none';
          out.push({ t: text.textContent ?? '', fg: getComputedStyle(text).fill, bg: f.startsWith('rgb') ? f : figBg });
        }
      }
      return out;
    });
    expect(rows.length).toBeGreaterThan(60);
    for (const r of rows) {
      const c = ratio(parseColor(r.fg) as RGB, parseColor(r.bg) as RGB);
      expect(c, `"${r.t}" ${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  test(`axe clean on the post and the blog list, ${theme} theme at 360px`, async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: `http://localhost:${process.env.WP_PORT ?? '8888'}`, viewport: { width: 360, height: 900 }, colorScheme: theme });
    const page = await ctx.newPage();
    for (const u of [postUrl, '/blog/']) {
      await open(page, u, theme);
      await page.waitForLoadState('networkidle');
      await page.evaluate(() => window.scrollTo(0, 0)); // the sticky translucent header over scrolled content is a site-wide axe "incomplete"
      expect(await axeProblems(page), u).toEqual([]);
    }
    await ctx.close();
  });
}
