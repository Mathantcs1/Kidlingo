import { expenseInBase } from './balances';
import { toDecimalString } from './money';
import type { AppState, Expense, Group } from './types';
import { categoryOf } from './types';

export const STORAGE_KEY = 'fairshare:v1';

export function defaultState(): AppState {
  return { version: 1, groups: [], expenses: [], settings: { theme: 'system', defaultCurrency: guessCurrency() } };
}

function guessCurrency(): string {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    const map: Record<string, string> = {
      IN: 'INR', US: 'USD', GB: 'GBP', AE: 'AED', AU: 'AUD', CA: 'CAD', SG: 'SGD', JP: 'JPY',
      DE: 'EUR', FR: 'EUR', ES: 'EUR', IT: 'EUR', NL: 'EUR', IE: 'EUR', NZ: 'NZD', LK: 'LKR',
    };
    return (region && map[region]) || 'USD';
  } catch {
    return 'USD';
  }
}

/** Validate and normalise unknown JSON into AppState. Throws with a readable message. */
export function parseState(raw: unknown): AppState {
  if (!raw || typeof raw !== 'object') throw new Error('Not a Fairshare backup');
  const s = raw as Partial<AppState>;
  if (s.version !== 1 || !Array.isArray(s.groups) || !Array.isArray(s.expenses)) throw new Error('Unsupported backup format');
  for (const g of s.groups) {
    if (typeof g.id !== 'string' || typeof g.name !== 'string' || !Array.isArray(g.members)) throw new Error('Corrupt group in backup');
  }
  for (const e of s.expenses) {
    if (typeof e.id !== 'string' || !Number.isInteger(e.amount) || !Array.isArray(e.payers) || !e.split) {
      throw new Error('Corrupt expense in backup');
    }
  }
  return { version: 1, groups: s.groups, expenses: s.expenses, settings: { ...defaultState().settings, ...s.settings } };
}

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return parseState(JSON.parse(raw));
  } catch (err) {
    console.error('Could not load saved data', err);
  }
  return defaultState();
}

export function saveState(state: AppState) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Could not save data', err);
  }
}

const csvCell = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Spreadsheet-friendly export: one row per expense, one column per member's net effect. */
export function groupToCSV(group: Group, expenses: Expense[]): string {
  const members = group.members;
  const head = ['Date', 'Description', 'Category', 'Type', 'Amount', 'Currency', `Amount (${group.baseCurrency})`, ...members.map((m) => m.name), 'Notes'];
  const rows = expenses
    .filter((e) => e.groupId === group.id && !e.deletedAt)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((e) => {
      const { paid, owed, total } = expenseInBase(e, group.baseCurrency);
      return [
        e.date,
        e.description,
        categoryOf(e.category).label,
        e.kind,
        toDecimalString(e.amount, e.currency),
        e.currency,
        toDecimalString(total, group.baseCurrency),
        ...members.map((m) => toDecimalString((paid[m.id] ?? 0) - (owed[m.id] ?? 0), group.baseCurrency)),
        e.notes ?? '',
      ];
    });
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n');
}

export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Share links: a whole group compressed into the URL fragment (never sent to any server). ----

interface SharePayload {
  v: 1;
  group: Group;
  expenses: Expense[];
}

const b64url = (bytes: Uint8Array) => {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
};

async function pipe(bytes: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encodeGroup(group: Group, expenses: Expense[]): Promise<string> {
  const payload: SharePayload = { v: 1, group, expenses: expenses.filter((e) => e.groupId === group.id && !e.deletedAt) };
  const json = new TextEncoder().encode(JSON.stringify(payload));
  return b64url(await pipe(json, new CompressionStream('deflate-raw')));
}

export async function decodeGroup(code: string): Promise<SharePayload> {
  const json = new TextDecoder().decode(await pipe(fromB64url(code), new DecompressionStream('deflate-raw')));
  const p = JSON.parse(json) as SharePayload;
  if (p.v !== 1 || !p.group || !Array.isArray(p.expenses)) throw new Error('Invalid share link');
  parseState({ version: 1, groups: [p.group], expenses: p.expenses });
  return p;
}
