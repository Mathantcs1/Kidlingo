import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const kv = vi.hoisted(() => {
  const data = new Map<string, unknown>();
  return {
    data,
    createStore: vi.fn((db: string, store: string) => ({ db, store })),
    get: vi.fn(async (k: string, _store?: unknown) => data.get(k)),
    set: vi.fn(async (k: string, v: unknown, _store?: unknown) => void data.set(k, v)),
    del: vi.fn(async (k: string, _store?: unknown) => void data.delete(k)),
  };
});
vi.mock('idb-keyval', () => kv);

import { keyStore, maskKey } from '../src/ai/keyStore';

const KEY = 'sk_test_KEYLEAKCANARY_123456';

beforeEach(() => {
  kv.data.clear();
  for (const f of [kv.createStore, kv.get, kv.set, kv.del]) f.mockClear();
  vi.stubGlobal('indexedDB', {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('keyStore', () => {
  it('round trips, trims and clears', async () => {
    expect(await keyStore.hasKey()).toBe(false);
    expect(await keyStore.getKey()).toBeNull();
    await keyStore.setKey(`  ${KEY}\n`);
    expect(await keyStore.getKey()).toBe(KEY);
    expect(await keyStore.hasKey()).toBe(true);
    await keyStore.clearKey();
    expect(await keyStore.getKey()).toBeNull();
    expect(await keyStore.hasKey()).toBe(false);
  });

  it('uses its own idb database, never the default project store', async () => {
    vi.resetModules();
    const fresh = (await import('../src/ai/keyStore')).keyStore;
    kv.createStore.mockImplementation((db: string, store: string) => ({ db, store }));
    await fresh.setKey(KEY);
    expect(kv.createStore).toHaveBeenCalledTimes(1);
    const [db] = kv.createStore.mock.calls[0]!;
    expect(db).not.toBe('keyval-store');
    expect(kv.set.mock.calls.length).toBeGreaterThan(0);
    for (const c of kv.set.mock.calls) expect(c[2]).toEqual({ db, store: expect.any(String) });
  });

  it.each(['', '   ', 'a b', 'ab\tcd', 'ab\u0000cd', 'a'.repeat(257), 'ab\ncd'])('rejects %j without echoing it', async (bad) => {
    const e = await keyStore.setKey(bad).then(() => null, (x: Error) => x);
    expect(e).toBeInstanceOf(Error);
    if (bad.trim().length > 3) expect(e!.message).not.toContain(bad.trim());
    expect(kv.set).not.toHaveBeenCalled();
  });

  it('a rejected key message does not echo the value', async () => {
    const bad = KEY + ' extra';
    const e = await keyStore.setKey(bad).then(() => null, (x: Error) => x);
    expect(e!.message).not.toContain('KEYLEAKCANARY');
    expect(String(e)).not.toContain('KEYLEAKCANARY');
  });

  it('accepts exactly 256 characters', async () => {
    await keyStore.setKey('k'.repeat(256));
    expect(await keyStore.hasKey()).toBe(true);
  });

  it('consent defaults to false and persists', async () => {
    expect(await keyStore.getConsent()).toBe(false);
    await keyStore.setConsent(true);
    expect(await keyStore.getConsent()).toBe(true);
    await keyStore.setConsent(false);
    expect(await keyStore.getConsent()).toBe(false);
  });

  it('swallows idb failures to safe defaults without leaking the key', async () => {
    const spies = (['log', 'warn', 'error', 'info', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    kv.get.mockRejectedValue(new Error('boom ' + KEY));
    kv.set.mockRejectedValue(new Error('boom ' + KEY));
    kv.del.mockRejectedValue(new Error('boom ' + KEY));
    expect(await keyStore.getKey()).toBeNull();
    expect(await keyStore.hasKey()).toBe(false);
    expect(await keyStore.getConsent()).toBe(false);
    await expect(keyStore.clearKey()).resolves.toBeUndefined();
    await expect(keyStore.setConsent(true)).resolves.toBeUndefined();
    await keyStore.setKey(KEY).catch((e: Error) => expect(String(e)).not.toContain(KEY));
    for (const s of spies) expect(JSON.stringify(s.mock.calls)).not.toContain(KEY);
  });

  it('is inert without IndexedDB', async () => {
    vi.stubGlobal('indexedDB', undefined);
    expect(await keyStore.getKey()).toBeNull();
    expect(await keyStore.getConsent()).toBe(false);
    await expect(keyStore.clearKey()).resolves.toBeUndefined();
  });

  it('ignores a non-string stored value', async () => {
    kv.data.set('apiKey', 42);
    kv.data.set('consent', 'yes');
    expect(await keyStore.getKey()).toBeNull();
    expect(await keyStore.getConsent()).toBe(false);
  });
});

describe('maskKey', () => {
  it('shows first 3 and last 4', () => {
    expect(maskKey('sk_test_KEYLEAKCANARY_123456')).toBe('sk_…3456');
  });
  it('fully masks short keys', () => {
    expect(maskKey('abcdefghijk')).toBe('••••');
    expect(maskKey('')).toBe('••••');
    expect(maskKey('abcdefghijkl')).toBe('abc…ijkl');
  });
});
