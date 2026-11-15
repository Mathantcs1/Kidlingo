import { test, expect } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { open } from './helpers';

const KEY = 'sk_e2e_KEYCANARY_987654';
const SHOWN = 'sk_…7654';

interface Seen {
  url: string;
  headers: Record<string, string>;
}

/** Stubs api.elevenlabs.io (the real API is never called) and records every request that targets it or carries the key. */
async function stubApi(page: Page, opts: { status?: number } = {}): Promise<Seen[]> {
  const seen: Seen[] = [];
  page.on('request', (r: Request) => {
    const h = r.headers();
    if (r.url().includes('elevenlabs.io') || Object.values(h).some((v) => v.includes(KEY))) seen.push({ url: r.url(), headers: h });
  });
  await page.route('https://api.elevenlabs.io/**', async (route) => {
    const url = route.request().url();
    const key = route.request().headers()['xi-api-key'];
    const status = key === KEY ? (opts.status ?? 200) : 401;
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (status !== 200) return route.fulfill({ status, headers: cors, contentType: 'application/json', body: '{"detail":{"status":"invalid_api_key"}}' });
    if (url.includes('/v1/user/subscription')) {
      return route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ character_count: 1200, character_limit: 10000 }) });
    }
    return route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ voices: [{ voice_id: 'v1', name: 'Rachel' }] }) });
  });
  return seen;
}

async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('btn-settings').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
}

async function saveKey(page: Page): Promise<void> {
  await page.getByTestId('eleven-key-input').fill(KEY);
  await page.getByTestId('eleven-key-save').click();
  await expect(page.getByTestId('eleven-key-status')).toContainText(SHOWN);
}

/** Everything a viewer or script could read from the page: text, attributes, storage and the dev hook. */
async function domLeaks(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const hits: string[] = [];
    if (document.body.innerText.includes(key) || document.body.textContent?.includes(key)) hits.push('text');
    for (const el of document.querySelectorAll('*')) {
      for (const a of el.getAttributeNames()) if (el.getAttribute(a)?.includes(key)) hits.push(`attr ${el.tagName}.${a}`);
      if ((el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) && el.value.includes(key)) hits.push('input value');
    }
    for (const s of [localStorage, sessionStorage]) for (let i = 0; i < s.length; i++) if ((s.getItem(s.key(i)!) ?? '').includes(key) || s.key(i)!.includes(key)) hits.push('web storage');
    const hook = (window as unknown as { __clipforge?: unknown }).__clipforge;
    try {
      if (JSON.stringify(hook, (_k, v) => (typeof v === 'function' ? undefined : v)).includes(key)) hits.push('dev hook state');
    } catch {
      /* unserialisable state: cannot hold the key as text */
    }
    return hits;
  }, KEY);
}

/** Scans every record of every IndexedDB database except the dedicated secrets one for the key. */
async function projectDbLeaks(page: Page): Promise<{ scanned: string[]; hits: string[] }> {
  return page.evaluate(async (key) => {
    const scanned: string[] = [];
    const hits: string[] = [];
    const dbs = await indexedDB.databases();
    for (const info of dbs) {
      if (!info.name || info.name === 'clipforge-ai-secrets') continue;
      const db = await new Promise<IDBDatabase>((res, rej) => {
        const r = indexedDB.open(info.name!);
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      for (const store of [...db.objectStoreNames]) {
        scanned.push(`${info.name}/${store}`);
        const all = await new Promise<unknown[]>((res, rej) => {
          const q = db.transaction(store).objectStore(store).getAll();
          q.onsuccess = () => res(q.result);
          q.onerror = () => rej(q.error);
        });
        if (JSON.stringify(all, (_k, v) => (v instanceof Blob || v instanceof ArrayBuffer ? undefined : v)).includes(key)) hits.push(`${info.name}/${store}`);
      }
      db.close();
    }
    return { scanned, hits };
  }, KEY);
}

test.beforeEach(async ({ page }) => {
  // Block anything else that is not the dev server, so a stray call to the real API can never succeed.
  await page.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());
});

test('Settings opens from the top bar, explains privacy, and closes with Escape returning focus', async ({ page }) => {
  await stubApi(page);
  await open(page);
  await page.getByTestId('btn-settings').focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByTestId('settings-dialog');
  await expect(dialog).toBeVisible();
  const note = page.getByTestId('eleven-privacy-note');
  await expect(note).toBeVisible();
  await expect(note).toContainText('only in this browser');
  await expect(note).toContainText('sent to ElevenLabs');
  await expect(note).toContainText('own terms');
  await expect(note).toContainText('no server');
  const input = page.getByTestId('eleven-key-input');
  await expect(input).toHaveAttribute('type', 'password');
  await expect(input).toHaveAttribute('autocomplete', 'off');
  await expect(input).toHaveAttribute('spellcheck', 'false');
  await expect(page.getByTestId('eleven-key-status')).toContainText('No key saved');
  // Focus is trapped inside the dialog.
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.querySelector('[data-testid="settings-dialog"]')?.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(page.getByTestId('btn-settings')).toBeFocused();
});

test('Save validates, masks the key, clears the input and never renders the full key', async ({ page }) => {
  const seen = await stubApi(page);
  await open(page);
  await openSettings(page);
  await page.getByTestId('eleven-key-input').fill('   ');
  await page.getByTestId('eleven-key-save').click();
  await expect(page.getByTestId('settings-dialog')).toContainText('Enter your ElevenLabs API key.');
  await saveKey(page);
  await expect(page.getByTestId('eleven-key-input')).toHaveValue('');
  expect(await domLeaks(page)).toEqual([]);
  // Nothing contacts ElevenLabs until Test key is pressed.
  expect(seen).toEqual([]);
  await page.getByTestId('eleven-key-save').click(); // empty input again: still masked, error shown
  await expect(page.getByTestId('eleven-key-status')).toContainText(SHOWN);
  await page.keyboard.press('Escape');
  expect(await domLeaks(page)).toEqual([]);
});

test('the key survives a reload, shown masked, and is in no project data', async ({ page }) => {
  await stubApi(page);
  await open(page);
  await openSettings(page);
  await saveKey(page);
  await page.getByTestId('eleven-key-input').fill('typing-in-progress');
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await openSettings(page);
  await expect(page.getByTestId('eleven-key-status')).toContainText(SHOWN);
  await expect(page.getByTestId('eleven-key-input')).toHaveValue('');
  expect(await domLeaks(page)).toEqual([]);
  await page.evaluate(() => window.__clipforge?.flushAutosave());
  const { scanned, hits } = await projectDbLeaks(page);
  expect(scanned.length).toBeGreaterThan(0);
  expect(hits).toEqual([]);
});

test('Test key reports a working key with the remaining characters, and only xi-api-key to api.elevenlabs.io carries the key', async ({ page }) => {
  const seen = await stubApi(page);
  await open(page);
  await openSettings(page);
  await saveKey(page);
  expect(seen).toEqual([]);
  await page.getByTestId('eleven-key-test').click();
  const status = page.getByTestId('eleven-key-status');
  await expect(status).toContainText('Key works');
  await expect(status).toContainText('8,800');
  expect(await domLeaks(page)).toEqual([]);
  const real = seen.filter((s) => s.url.startsWith('https://api.elevenlabs.io/'));
  expect(real.length).toBeGreaterThan(0);
  for (const s of seen) {
    expect(new URL(s.url).origin).toBe('https://api.elevenlabs.io');
    expect(s.url).not.toContain(KEY);
    for (const [name, value] of Object.entries(s.headers)) {
      if (value.includes(KEY)) expect(name).toBe('xi-api-key');
    }
  }
  expect(real.some((s) => s.headers['xi-api-key'] === KEY)).toBe(true);
});

test('Test key shows the plain-English message for a rejected key', async ({ page }) => {
  await stubApi(page, { status: 401 });
  await open(page);
  await openSettings(page);
  await saveKey(page);
  await page.getByTestId('eleven-key-test').click();
  await expect(page.getByTestId('eleven-key-status')).toContainText('did not accept your API key');
  expect(await domLeaks(page)).toEqual([]);
});

test('Remove clears the key and consent, and a reload shows no key', async ({ page }) => {
  await stubApi(page);
  await open(page);
  await openSettings(page);
  await saveKey(page);
  await page.getByTestId('eleven-key-remove').click();
  await expect(page.getByTestId('eleven-key-status')).toContainText('No key saved');
  await expect(page.getByTestId('eleven-key-remove')).toBeDisabled();
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await openSettings(page);
  await expect(page.getByTestId('eleven-key-status')).toContainText('No key saved');
  await page.getByTestId('eleven-key-test').click();
  await expect(page.getByTestId('eleven-key-status')).toContainText('Add your ElevenLabs API key');
});
