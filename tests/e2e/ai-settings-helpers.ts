import { expect } from '@playwright/test';
import type { Page, Request } from '@playwright/test';

export const KEY = 'sk_e2e_KEYCANARY_987654';
export const SHOWN = 'sk_…7654';

export interface Seen {
  url: string;
  headers: Record<string, string>;
}

/** Stubs api.elevenlabs.io (the real API is never called) and records every request that targets it or carries the key. */
export async function stubApi(page: Page, opts: { status?: number; delayMs?: number } = {}): Promise<Seen[]> {
  const seen: Seen[] = [];
  page.on('request', (r: Request) => {
    const h = r.headers();
    if (r.url().includes('elevenlabs.io') || Object.values(h).some((v) => v.includes(KEY))) seen.push({ url: r.url(), headers: h });
  });
  await page.route('https://api.elevenlabs.io/**', async (route) => {
    const url = route.request().url();
    const key = route.request().headers()['xi-api-key'];
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
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

export async function openSettings(page: Page): Promise<void> {
  await page.getByTestId('btn-settings').click();
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
}

export async function saveKey(page: Page): Promise<void> {
  await page.getByTestId('eleven-key-input').fill(KEY);
  await page.getByTestId('eleven-key-save').click();
  await expect(page.getByTestId('eleven-key-status')).toContainText(SHOWN);
}

/** Everything a viewer or script could read from the page: text, attributes, storage and the dev hook. */
export async function domLeaks(page: Page): Promise<string[]> {
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
export async function projectDbLeaks(page: Page): Promise<{ scanned: string[]; hits: string[] }> {
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

