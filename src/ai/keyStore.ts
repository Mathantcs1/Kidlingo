import { createStore, del, get, set, type UseStore } from 'idb-keyval';

/**
 * The ElevenLabs API key lives in its OWN IndexedDB database, deliberately separate from the default idb-keyval
 * store that holds the project (`src/state/persist.ts`). Project persistence, clearing, session GC and export
 * therefore never see or touch the key. It is never logged and never placed in an error message.
 */
const DB_NAME = 'clipforge-ai-secrets';
const STORE_NAME = 'secrets';
const KEY_ID = 'apiKey';
const CONSENT_ID = 'consent';
const MAX_KEY_LENGTH = 256;

let store: UseStore | undefined;
function secretsStore(): UseStore | null {
  if (typeof indexedDB === 'undefined') return null;
  store ??= createStore(DB_NAME, STORE_NAME);
  return store;
}

/** First 3 chars + ellipsis + last 4; keys shorter than 12 chars are fully masked. */
export function maskKey(k: string): string {
  if (k.length < 12) return '••••';
  return `${k.slice(0, 3)}…${k.slice(-4)}`;
}

async function read(id: string): Promise<unknown> {
  try {
    const s = secretsStore();
    return s ? await get(id, s) : undefined;
  } catch {
    return undefined;
  }
}

async function write(id: string, value: unknown): Promise<void> {
  try {
    const s = secretsStore();
    if (s) await set(id, value, s);
  } catch {
    /* swallowed: a storage failure must not surface (or risk echoing) anything */
  }
}

async function getKey(): Promise<string | null> {
  const v = await read(KEY_ID);
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Throws a fixed message that never contains the value. */
async function setKey(raw: string): Promise<void> {
  const k = raw.trim();
  if (k.length === 0) throw new Error('Enter your ElevenLabs API key.');
  if (k.length > MAX_KEY_LENGTH) throw new Error('That does not look like an API key (too long).');
  // Header-safe printable ASCII only (no spaces, control or non-Latin characters).
  if (!/^[\x21-\x7e]+$/.test(k)) throw new Error('That does not look like an API key (use only letters, digits and symbols, no spaces).');
  try {
    const s = secretsStore();
    if (!s) throw new Error('unavailable');
    await set(KEY_ID, k, s);
  } catch {
    throw new Error('Could not save the key in this browser.');
  }
}

async function clearKey(): Promise<void> {
  try {
    const s = secretsStore();
    if (s) await del(KEY_ID, s);
  } catch {
    /* swallowed */
  }
}

async function hasKey(): Promise<boolean> {
  return (await getKey()) !== null;
}

async function getConsent(): Promise<boolean> {
  return (await read(CONSENT_ID)) === true;
}

async function setConsent(v: boolean): Promise<void> {
  await write(CONSENT_ID, v);
}

export const keyStore = { getKey, setKey, clearKey, hasKey, maskKey, getConsent, setConsent };
