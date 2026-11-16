import { test, expect, type Page } from '@playwright/test';
import { adminApi, capturedMails, cleanup, resetContent, saveSettings, type Api } from './helpers/wp';

// Double opt-in through the real site: sign-up form -> captured confirmation mail -> confirm page (GET shows a button, POST changes
// state) -> unsubscribe / delete. Mail is captured by tests/e2e/fixtures/ita-mail-capture.php; nothing is sent.
test.describe.configure({ mode: 'serial' });

let api: Api;
const tag = Date.now();
const mine = (n: string) => `optin${tag}${n}@example.com`;
const made: string[] = [];

test.beforeAll(async () => { api = await adminApi(); await resetContent(api); });
test.afterAll(async () => { await deleteSubscribers(made); await cleanup(api); await resetContent(api); });

const adminList = async () => (await api.ctx.get('/wp-admin/tools.php?page=ideatoapps-newsletter')).text();
const rowStatus = (html: string, email: string) => new RegExp(`<td>${email.replace(/[.+]/g, '\\$&')}</td>\\s*<td>(\\w+)</td>`).exec(html)?.[1] ?? null;
const nonceFor = (html: string, action: string) => new RegExp(`value="${action}">[\\s\\S]*?name="_wpnonce" value="([a-f0-9]+)"`).exec(html)?.[1] ?? '';

async function deleteSubscribers(emails: string[]) {
  const html = await adminList();
  const ids = emails.flatMap((e) => [...html.matchAll(new RegExp(`name="subscriber_ids\\[\\]" value="(\\d+)"[^>]*>\\s*</th>\\s*<td>${e.replace(/[.+]/g, '\\$&')}</td>`, 'g'))].map((m) => m[1]));
  if (!ids.length) return;
  const form = new URLSearchParams({ action: 'ideatoapps_delete_subscribers', _wpnonce: nonceFor(html, 'ideatoapps_delete_subscribers'), bulk_action: 'delete' });
  ids.forEach((id) => form.append('subscriber_ids[]', id));
  const res = await api.ctx.post('/wp-admin/admin-post.php', { data: form.toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, maxRedirects: 0 });
  expect(res.status()).toBe(302);
}

async function csv(): Promise<string> {
  const nonce = nonceFor(await adminList(), 'ideatoapps_export_subscribers');
  const res = await api.ctx.post('/wp-admin/admin-post.php', { data: new URLSearchParams({ action: 'ideatoapps_export_subscribers', _wpnonce: nonce }).toString(), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
  expect(res.status()).toBe(200);
  return res.text();
}

async function signUp(page: Page, email: string) {
  made.push(email);
  await page.goto('/');
  const section = page.getByTestId('newsletter');
  await section.getByLabel('Email address', { exact: true }).fill(email);
  await section.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Subscribe' }).click();
  await expect(section.getByTestId('form-status')).toContainText('Your sign-up only counts once you click it', { timeout: 20_000 });
}

const link = (body: string, kind: 'confirm' | 'unsubscribe') => new RegExp(`https?://\\S+ita_newsletter=${kind}\\S*`).exec(body)![0];

test('while the switch is off the home page says sign-up is not open yet and the endpoint answers 503', async ({ page }) => {
  await page.goto('/');
  const section = page.getByTestId('newsletter');
  await expect(section).toContainText('Sign-up is not open yet');
  await expect(section.locator('form, input')).toHaveCount(0);
  const res = await page.request.post(`/?rest_route=${encodeURIComponent('/ideatoapps/v1/newsletter')}`, { data: { email: 'x@example.com', consent: true } });
  expect(res.status()).toBe(503);
});

test('sign-up, scanner fetch changes nothing, confirm button confirms, only then is the address exported', async ({ page }) => {
  await saveSettings(api, { newsletter: true });
  await capturedMails(api, true);
  const email = mine('a');
  await signUp(page, email);
  const mails = (await capturedMails(api)).filter((m) => m.to.includes(email));
  expect(mails).toHaveLength(1);
  expect(mails[0].subject).toBe('Confirm your IdeaToApps newsletter sign-up');
  const confirmUrl = link(mails[0].message, 'confirm');
  expect(mails[0].message).toMatch(/ignore this email/i);
  expect(link(mails[0].message, 'unsubscribe')).toContain('ita_newsletter=unsubscribe');

  // A link scanner just GETs (twice): the page answers, the state stays pending, headers keep it private.
  for (let i = 0; i < 2; i++) {
    const scan = await page.request.get(confirmUrl);
    expect(scan.status()).toBe(200);
    expect(scan.headers()['x-robots-tag']).toContain('noindex');
    expect(scan.headers()['cache-control']).toContain('no-store');
    expect(scan.headers()['referrer-policy']).toBe('no-referrer');
  }
  expect(rowStatus(await adminList(), email)).toBe('pending');
  expect(await csv()).not.toContain(email);

  // Same neutral answer for an already-listed address, and no second email inside ten minutes.
  await signUp(page, email);
  expect((await capturedMails(api)).filter((m) => m.to.includes(email))).toHaveLength(1);

  await page.goto(confirmUrl);
  await expect(page.getByTestId('newsletter-confirm-button')).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
  await page.getByTestId('newsletter-confirm-button').click();
  await expect(page.getByTestId('newsletter-page')).toContainText('You are confirmed');
  expect(rowStatus(await adminList(), email)).toBe('confirmed');
  const exported = await csv();
  expect(exported).toContain(email);
  expect(exported.split('\n')[0]).toBe('email,consent_at,confirmed_at,status');
});

test('a tampered or truncated link is refused and changes nothing', async ({ page }) => {
  const email = mine('a');
  const confirm = link((await capturedMails(api)).filter((m) => m.to.includes(email))[0].message, 'confirm');
  const res = await page.request.get(confirm.replace(/(t=\d+\.[a-f0-9]{4})/, (m) => m + '0000'));
  expect(res.status()).toBe(400);
  const gone = await page.request.get(confirm.replace(/&t=.*/, ''));
  expect(gone.status()).toBe(400);
  expect(rowStatus(await adminList(), email)).toBe('confirmed');
});

test('unsubscribe keeps only the opt-out; a confirmed address cannot be re-confirmed afterwards', async ({ page }) => {
  const email = mine('a');
  const mail = (await capturedMails(api)).filter((m) => m.to.includes(email))[0];
  await page.goto(link(mail.message, 'unsubscribe'));
  await expect(page.getByTestId('newsletter-delete-button')).toHaveText('Unsubscribe and delete my data');
  await expect(page.getByTestId('newsletter-result')).toContainText('keeps only your email address');
  await page.getByTestId('newsletter-unsubscribe-button').click();
  await expect(page.getByTestId('newsletter-page')).toContainText('You are unsubscribed');
  expect(rowStatus(await adminList(), email)).toBe('unsubscribed');
  expect(await csv()).not.toContain(email);
  await page.goto(link(mail.message, 'confirm'));
  await expect(page.getByTestId('newsletter-confirm-button')).toHaveCount(0);
  expect(rowStatus(await adminList(), email)).toBe('unsubscribed');
});

test('Unsubscribe and delete my data removes the row completely', async ({ page }) => {
  const email = mine('b');
  await signUp(page, email);
  const mail = (await capturedMails(api)).filter((m) => m.to.includes(email))[0];
  expect(rowStatus(await adminList(), email)).toBe('pending');
  await page.goto(link(mail.message, 'unsubscribe'));
  await page.getByTestId('newsletter-delete-button').click();
  await expect(page.getByTestId('newsletter-page')).toContainText('permanently deleted');
  expect(rowStatus(await adminList(), email)).toBeNull();
});

test('the admin bulk Delete permanently removes ticked rows', async ({ page }) => {
  const email = mine('c');
  await signUp(page, email);
  expect(rowStatus(await adminList(), email)).toBe('pending');
  await deleteSubscribers([email]);
  expect(rowStatus(await adminList(), email)).toBeNull();
});
