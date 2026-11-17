import { test, expect, type Page } from '@playwright/test';
import { axeProblems } from './helpers/a11y';
import { horizontalOverflow } from './helpers/layout';
import { adminApi, cleanup, createPost, resetContent, type Api } from './helpers/wp';

// Interactive blog shortcodes (plugin ideatoapps-core): behaviour with JavaScript, the static fallback without it, axe in both themes.
test.describe.configure({ mode: 'serial' });

let api: Api;
let url = '';
let brokenUrl = '';

const PROMPT = 'Explain [a topic] to me like I am ten.\nUse one example & a short list.'; // [a topic] is a slot: the box shows the note.
const CONTENT = `
<p>Intro with a [ita_term define="A chunk of text a model reads"]token[/ita_term] in it.</p>

[ita_prompt title="Ask it like this"]${PROMPT}[/ita_prompt]

[ita_quiz]
[ita_q q="What is 2 + 2?" answers="3|4|5" correct="2" why="Basic sums."]
[ita_q q="Capital of France?" answers="Paris|Rome" correct="1" why="Paris."]
[ita_q q="Pick blue" answers="Red|Green|Blue" correct="3"]
[/ita_quiz]

[ita_checklist id="week-one"]
[ita_item]Open a chat[/ita_item]
[ita_item]Ask one question[/ita_item]
[ita_item]Check the answer[/ita_item]
[/ita_checklist]

[ita_why title="Why does this work?"]Because <strong>specific</strong> asks get specific answers.[/ita_why]
`;
const BROKEN = `<p>Start.</p>
[ita_prompt][/ita_prompt] [ita_quiz][ita_q q="No answers"][ita_q][/ita_quiz] [ita_checklist][/ita_checklist]
[ita_term]just a word[/ita_term] [ita_why][/ita_why] [ita_quiz]Loose text only[/ita_quiz] <p>End.</p>`;

test.beforeAll(async () => {
  api = await adminApi();
  await resetContent(api);
  const id = await createPost(api, 'Interactive fixture', { content: CONTENT });
  const bad = await createPost(api, 'Broken fixture', { content: BROKEN });
  url = `/?p=${id}`;
  brokenUrl = `/?p=${bad}`;
});
test.afterAll(async () => { await cleanup(api); await resetContent(api); });

const box = (page: Page, id: string) => page.getByTestId(id);

test.describe('with JavaScript', () => {
  test('copy button copies the prompt text and announces "Copied"', async ({ page, context }) => {
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await page.goto(url);
    const button = box(page, 'ita-prompt').getByRole('button', { name: 'Copy prompt' });
    await button.click();
    await expect(box(page, 'ita-prompt').getByRole('status')).toHaveText('Copied');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(PROMPT); // the note above the text is not copied.
    await expect(box(page, 'ita-prompt').getByTestId('ita-prompt-note')).toHaveText('Replace the parts in [brackets] with your own details.');
  });

  test('copy falls back to a textarea when the clipboard API is missing', async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: undefined }); });
    await page.goto(url);
    await page.evaluate(() => { document.execCommand = () => { (window as unknown as { __copied: boolean }).__copied = true; return true; }; });
    await box(page, 'ita-prompt').getByRole('button', { name: 'Copy prompt' }).click();
    await expect(box(page, 'ita-prompt').getByRole('status')).toHaveText('Copied');
    expect(await page.evaluate(() => (window as unknown as { __copied?: boolean }).__copied)).toBe(true);
  });

  test('copy fallback returns focus to the Copy button, also when clipboard.writeText rejects', async ({ page }) => {
    for (const reject of [false, true]) {
      await page.addInitScript((r) => {
        if (r) Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true });
        else Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      }, reject);
      await page.goto(url);
      await page.evaluate(() => { document.execCommand = () => true; });
      const button = box(page, 'ita-prompt').getByRole('button', { name: 'Copy prompt' });
      await button.click();
      await expect(box(page, 'ita-prompt').getByRole('status')).toHaveText('Copied');
      await expect(button).toBeFocused();
      expect(await page.locator('textarea').count(), 'temporary textarea removed').toBe(0);
    }
  });

  test('quiz gives feedback per question and a final score', async ({ page }) => {
    await page.goto(url);
    const quiz = box(page, 'ita-quiz');
    await expect(quiz.locator('details')).toHaveCount(0); // answers are not shown up front
    await expect(quiz.getByRole('radio')).toHaveCount(8);
    await expect(quiz.locator('fieldset > legend')).toHaveCount(3);
    await expect(quiz.getByRole('group', { name: 'What is 2 + 2?' })).toBeVisible();
    await quiz.getByRole('radio', { name: /^A\. 3/ }).check();
    await expect(quiz.locator('.ita-q__result').first()).toContainText('Not quite. The answer is B. 4');
    await expect(quiz.locator('.ita-q__result').first()).toContainText('Basic sums.');
    await expect(quiz.locator('.ita-quiz__score')).toHaveText('');
    await quiz.getByRole('radio', { name: /^A\. Paris/ }).check();
    await expect(quiz.locator('.ita-q__result').nth(1)).toContainText('Correct.');
    await quiz.getByRole('radio', { name: /^C\. Blue/ }).check();
    await expect(quiz.locator('.ita-quiz__score')).toHaveText('Your score: 2 of 3.');
    await quiz.getByRole('radio', { name: /^B\. 4/ }).check(); // changing an answer re-scores
    await expect(quiz.locator('.ita-quiz__score')).toHaveText('Your score: 3 of 3.');
  });

  test('checklist state survives a reload and is kept per checklist id', async ({ page }) => {
    await page.goto(url);
    const list = box(page, 'ita-checklist');
    await expect(list.getByRole('checkbox')).toHaveCount(3);
    await expect(list.locator('.ita-checklist__status')).toHaveText('0 of 3 done');
    await list.getByRole('checkbox', { name: 'Ask one question' }).check();
    await expect(list.locator('.ita-checklist__status')).toHaveText('1 of 3 done');
    expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('week-one')).length)).toBe(1);
    await page.reload();
    await expect(box(page, 'ita-checklist').getByRole('checkbox', { name: 'Ask one question' })).toBeChecked();
    // Ticks saved for a different item list (edited or reordered) are dropped, not applied to the wrong items.
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.includes('week-one')) localStorage.setItem(k, JSON.stringify({ h: 'stale000', c: [0, 1] })); });
    await page.reload();
    await expect(box(page, 'ita-checklist').locator('.ita-checklist__status')).toHaveText('0 of 3 done');
    await box(page, 'ita-checklist').getByRole('checkbox', { name: 'Ask one question' }).check();
    await page.reload();
    await expect(box(page, 'ita-checklist').getByRole('checkbox', { name: 'Open a chat' })).not.toBeChecked();
  });

  test('checklist still works when localStorage throws', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'localStorage', { get() { throw new Error('blocked'); } });
    });
    await page.goto(url);
    const list = box(page, 'ita-checklist');
    await list.getByRole('checkbox', { name: 'Open a chat' }).check();
    await expect(list.locator('.ita-checklist__status')).toHaveText('1 of 3 done');
  });

  test('glossary term shows its definition on hover, focus and tap, and Escape closes it', async ({ page }) => {
    await page.goto(url);
    const term = box(page, 'ita-term');
    const tip = page.getByRole('tooltip');
    await expect(term).toHaveAccessibleDescription('A chunk of text a model reads'); // what a screen reader announces
    await term.hover();
    await expect(tip).toHaveText('A chunk of text a model reads');
    await page.mouse.move(0, 400);
    await expect(tip).toBeHidden();
    // WCAG 1.4.13: the bubble stays open while the pointer moves from the term onto it.
    await term.hover();
    await expect(tip).toBeVisible();
    const box2 = (await tip.boundingBox())!;
    await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2, { steps: 4 });
    await page.waitForTimeout(500);
    await expect(tip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await page.mouse.move(0, 400);
    await term.focus();
    await expect(tip).toBeVisible();
    await expect(term).toHaveAttribute('aria-describedby', /.+/);
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
    await page.locator('body').click({ position: { x: 5, y: 300 } });
    await term.click(); // tap
    await expect(tip).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(tip).toBeHidden();
  });

  test('the "Why" box expands and collapses', async ({ page }) => {
    await page.goto(url);
    const why = box(page, 'ita-why');
    await expect(why.locator('.ita-why__body')).toBeHidden();
    await why.getByText('Why does this work?').click();
    await expect(why.locator('.ita-why__body')).toContainText('specific asks get specific answers');
  });
});

test.describe('without JavaScript', () => {
  test.use({ javaScriptEnabled: false });

  test('prompt, quiz answers, checklist items and term definition are all readable', async ({ page }) => {
    await page.goto(url);
    await expect(box(page, 'ita-prompt')).toContainText('Explain [a topic] to me like I am ten.');
    await expect(box(page, 'ita-prompt').getByRole('button')).toHaveCount(0);
    const quiz = box(page, 'ita-quiz');
    await expect(quiz).toContainText('What is 2 + 2?');
    await expect(quiz.locator('.ita-q__options').first()).toContainText('5');
    const reveal = quiz.locator('details').first();
    await expect(reveal.locator('.ita-q__answer')).toBeHidden();
    await reveal.locator('summary').click();
    await expect(reveal.locator('.ita-q__answer')).toContainText('B. 4');
    await expect(reveal).toContainText('Basic sums.');
    await expect(box(page, 'ita-checklist')).toContainText('Open a chat');
    await expect(box(page, 'ita-checklist').locator('li')).toHaveCount(3);
    await expect(box(page, 'ita-term')).toHaveAttribute('title', 'A chunk of text a model reads');
    await expect(box(page, 'ita-why')).toContainText('Why does this work?');
  });
});

test('malformed shortcodes show readable text and no PHP notice', async ({ page }) => {
  await page.goto(brokenUrl);
  const main = await page.locator('main').innerText();
  expect(main).toContain('Start.');
  expect(main).toContain('just a word');
  expect(main).toContain('Loose text only');
  expect(main).toContain('End.');
  expect(main).not.toMatch(/\[ita_|Warning:|Notice:|Deprecated:|Fatal error/);
  await expect(page.getByTestId('post')).toBeVisible();
});

for (const theme of ['dark', 'light'] as const) {
  test(`axe clean and no sideways scroll at 360px, ${theme} theme (also with components opened)`, async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: `http://localhost:${process.env.WP_PORT ?? '8888'}`, viewport: { width: 360, height: 900 }, colorScheme: theme });
    await ctx.addInitScript((t) => { try { localStorage.setItem('ideatoapps-theme', t); } catch { /* falls back to OS setting */ } }, theme);
    const page = await ctx.newPage();
    await page.goto(url);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.waitForLoadState('networkidle');
    expect(await axeProblems(page), 'initial').toEqual([]);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    // Open every dynamic state: answered quiz, checked item, open Why box, visible tooltip.
    const quiz = box(page, 'ita-quiz');
    await quiz.getByRole('radio', { name: /^A\. 3/ }).check();
    await quiz.getByRole('radio', { name: /^A\. Paris/ }).check();
    await quiz.getByRole('radio', { name: /^C\. Blue/ }).check();
    await box(page, 'ita-checklist').getByRole('checkbox', { name: 'Open a chat' }).check();
    await box(page, 'ita-why').getByText('Why does this work?').click();
    await box(page, 'ita-prompt').getByRole('button', { name: 'Copy prompt' }).focus();
    await box(page, 'ita-term').focus();
    await expect(page.getByRole('tooltip')).toBeVisible();
    // Back to the top: the sticky translucent header over scrolled content is a site-wide axe "incomplete", not part of these components.
    await page.evaluate(() => window.scrollTo(0, 0));
    expect(await axeProblems(page), 'all states open').toEqual([]);
    expect(await horizontalOverflow(page)).toBeLessThanOrEqual(0);
    await ctx.close();
  });
}

test('prefers-reduced-motion: no transitions on the copy button', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: `http://localhost:${process.env.WP_PORT ?? '8888'}`, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  await page.goto(url);
  const t = await box(page, 'ita-prompt').getByRole('button').evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(Math.max(...t.split(',').map((x) => parseFloat(x))), `transition ${t}`).toBeLessThan(0.001);
  await ctx.close();
});
