import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { test, expect, type APIRequestContext, type Page } from '@playwright/test';
import { axeProblems } from './helpers/a11y';
import { adminApi, capturedMails, cleanup, createPost, resetContent, saveSettings, send, type Api } from './helpers/wp';

// Subscriber-only posts on a real site: a visitor gets the teaser and the subscribe card (the rest is not in the page source),
// sign-up -> captured confirmation -> Confirm unlocks the post in that browser, unsubscribing locks it again, and the
// "Email me a reading link" flow unlocks a new browser. Mail is captured by tests/e2e/fixtures/ita-mail-capture.php.
test.describe.configure({ mode: 'serial' });
test.setTimeout(120_000);

const base = `http://localhost:${process.env.WP_PORT ?? '8888'}`;
const LATE = ['Scroll through the week', 'Spotting one yourself teaches you what to watch for', 'Why use one chatbot app for the whole first week'];
const EARLY = 'A good way to learn an AI chatbot is to use it for small, real tasks';
const article = readFileSync(resolve(__dirname, '../../wp-content/plugins/ideatoapps-core/content/articles/08-your-first-week-with-ai.html'), 'utf8').replace(/^<!--ita .*?-->\n/, '');

let api: Api;
let id = 0;
let url = '';
const email = `reader${Date.now()}@example.com`;

/** Tick "Subscribers only" through the real editor form (the meta is protected: REST cannot write it). */
async function tickGateBox(postId: number, on: boolean) {
  const raw = await send(api, 'GET', `/wp/v2/posts/${postId}`, undefined, 'context=edit');
  const html = await (await api.ctx.get(`/wp-admin/post.php?post=${postId}&action=edit`)).text();
  const grab = (re: RegExp) => re.exec(html)?.[1] ?? '';
  expect(html).toContain('Subscribers only');
  const form = new URLSearchParams({
    action: 'editpost', originalaction: 'editpost', post_type: 'post', post_ID: String(postId),
    _wpnonce: grab(/id="_wpnonce" name="_wpnonce" value="([a-f0-9]+)"/), ita_gate_nonce: grab(/name="ita_gate_nonce" value="([a-f0-9]+)"/),
    post_title: raw.title.raw, content: raw.content.raw, excerpt: raw.excerpt.raw, post_status: 'publish', ita_gate_present: '1',
  });
  if (on) form.set('ita_gated', '1');
  const res = await api.ctx.post('/wp-admin/post.php', { data: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, maxRedirects: 0 });
  expect(res.status()).toBe(302);
}

const source = async (ctx: APIRequestContext) => (await ctx.get(url)).text();
const expectLocked = (html: string) => {
  for (const s of LATE) expect(html, s).not.toContain(s);
};
const mailsTo = async (to: string, n = 1) => {
  await expect.poll(async () => (await capturedMails(api)).filter((m) => m.to.includes(to)).length, { timeout: 15_000 }).toBeGreaterThanOrEqual(n);
  return (await capturedMails(api)).filter((m) => m.to.includes(to));
};
const linkIn = (body: string, re: RegExp) => re.exec(body)![0];

test.beforeAll(async () => {
  api = await adminApi();
  await resetContent(api);
  id = await createPost(api, 'Your first week with AI', { content: article });
  await tickGateBox(id, true);
  url = `/?p=${id}`;
  await saveSettings(api, { newsletter: true });
  await capturedMails(api, true);
});
test.afterAll(async () => { await cleanup(api); await resetContent(api); });

test('a visitor sees the teaser and the card, and the page source and REST hold none of the rest', async ({ page, request }) => {
  const res = await page.goto(url);
  expect(res?.headers()['cache-control']).toContain('no-store');
  expect(res?.headers()['cache-control']).toContain('private');
  expect(res?.headers()['vary']).toMatch(/Cookie/i);
  await expect(page.getByTestId('gate-teaser')).toContainText(EARLY);
  await expect(page.getByTestId('gate-card')).toBeVisible();
  await expect(page.getByTestId('gate-email')).toBeVisible();
  await expect(page.getByTestId('gate-link-form')).toBeVisible();
  expectLocked(await page.content());
  expectLocked(await source(request));
  expectLocked(await (await request.get(`/?rest_route=${encodeURIComponent(`/wp/v2/posts/${id}`)}`)).text());
  expectLocked(await (await request.get('/?feed=rss2')).text());
  const ld = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => JSON.parse(e.textContent ?? '')));
  expect(ld.find((n) => n['@type'] === 'Article')).toMatchObject({ isAccessibleForFree: false, hasPart: { '@type': 'WebPageElement', isAccessibleForFree: false, cssSelector: '.post-gated' } });
});

for (const theme of ['light', 'dark'] as const) {
  test(`gate card: axe clean and no sideways scroll at 360px, ${theme} theme`, async ({ browser }) => {
    const ctx = await browser.newContext({ baseURL: base, viewport: { width: 360, height: 900 }, colorScheme: theme });
    const page = await ctx.newPage();
    await page.goto(url);
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    await page.getByTestId('gate-card').scrollIntoViewIfNeeded();
    expect(await axeProblems(page)).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await ctx.close();
  });
}

async function unlockedIn(page: Page) {
  await page.goto(url);
  await expect(page.getByTestId('post')).toContainText(LATE[0]);
  await expect(page.getByTestId('gate-card')).toHaveCount(0);
}

test('sign up on the card, confirm from the mail: the post opens, stays open on reload, and locks after unsubscribing', async ({ browser }) => {
  const ctx = await browser.newContext({ baseURL: base });
  const page = await ctx.newPage();
  await page.goto(url);
  const card = page.getByTestId('gate-card');
  await card.getByTestId('gate-email').fill(email);
  await card.getByRole('checkbox').check();
  await card.getByRole('button', { name: 'Subscribe' }).click();
  await expect(card.getByTestId('form-status')).toContainText('Your sign-up only counts once you click it', { timeout: 20_000 });
  const mail = (await mailsTo(email))[0];
  await page.goto(linkIn(mail.message, /https?:\/\/\S+ita_newsletter=confirm\S*/));
  expect((await ctx.cookies()).find((c) => c.name === 'ita_reader'), 'the GET sets no cookie').toBeUndefined();
  await page.getByTestId('newsletter-confirm-button').click();
  await expect(page.getByTestId('newsletter-page')).toContainText('You are confirmed');
  const cookie = (await ctx.cookies()).find((c) => c.name === 'ita_reader');
  expect(cookie).toMatchObject({ httpOnly: true, sameSite: 'Lax', path: '/' });
  await unlockedIn(page);
  await page.reload();
  await expect(page.getByTestId('post')).toContainText(LATE[0]);

  await page.goto(linkIn(mail.message, /https?:\/\/\S+ita_newsletter=unsubscribe\S*/));
  await page.getByTestId('newsletter-unsubscribe-button').click();
  await expect(page.getByTestId('newsletter-page')).toContainText('You are unsubscribed');
  await page.goto(url);
  await expect(page.getByTestId('gate-card')).toBeVisible();
  expectLocked(await page.content());
  await ctx.close();
});

test('reading link: the same answer for any address, the mailed link shows a button, the POST unlocks a new browser once', async ({ browser }) => {
  // A second subscriber signs up and confirms in one browser...
  const other = `reader2${Date.now()}@example.com`;
  const setup = await browser.newContext({ baseURL: base });
  const sp = await setup.newPage();
  await sp.goto(url);
  const card = sp.getByTestId('gate-card');
  await card.getByTestId('gate-email').fill(other);
  await card.getByRole('checkbox').check();
  await card.getByRole('button', { name: 'Subscribe' }).click();
  await expect(card.getByTestId('form-status')).toContainText('Your sign-up only counts', { timeout: 20_000 });
  const confirm = (await mailsTo(other))[0];
  await sp.goto(linkIn(confirm.message, /https?:\/\/\S+ita_newsletter=confirm\S*/));
  await sp.getByTestId('newsletter-confirm-button').click();
  await expect(sp.getByTestId('newsletter-page')).toContainText('You are confirmed');
  await setup.close();

  // ...then asks for a reading link in another browser, without JavaScript.
  const ctx = await browser.newContext({ baseURL: base, javaScriptEnabled: false });
  const page = await ctx.newPage();
  const answer = async (address: string) => {
    await page.goto(url);
    const form = page.getByTestId('gate-link-form');
    await form.getByLabel('Email address').fill(address);
    await form.getByRole('button', { name: 'Email me a reading link' }).click();
    return page.getByTestId('reader-result').innerText();
  };
  const unknown = await answer(`nobody${Date.now()}@example.com`);
  const known = await answer(other);
  expect(known).toBe(unknown);
  expect(known).toContain('If this address is a confirmed subscriber');
  const reading = (await mailsTo(other, 2)).find((m) => m.subject === 'Your IdeaToApps reading link')!;
  const read = linkIn(reading.message, /https?:\/\/\S+ita_reader=read\S*/);
  await page.goto(read);
  expect((await ctx.cookies()).find((c) => c.name === 'ita_reader'), 'GET sets nothing').toBeUndefined();
  await page.getByTestId('reader-read-button').click();
  await expect(page.getByTestId('reader-page')).toHaveAttribute('data-view', 'unlocked');
  await page.getByTestId('reader-back').click();
  await expect(page.getByTestId('post')).toContainText(LATE[0]);
  await page.goto(read);
  await expect(page.getByTestId('reader-page')).toHaveAttribute('data-view', 'used');
  await ctx.close();
});

test('with the newsletter switched off every visitor reads the whole post', async ({ request }) => {
  await saveSettings(api, {});
  const html = await source(request);
  for (const s of LATE) expect(html).toContain(s);
  expect(html).not.toContain('data-testid="gate-card"');
});
