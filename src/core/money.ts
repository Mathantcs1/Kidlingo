import type { Minor } from './types';

const digitsCache = new Map<string, number>();

/** Number of minor-unit digits for a currency (2 for USD/INR, 0 for JPY, 3 for KWD). */
export function currencyDigits(currency: string): number {
  let d = digitsCache.get(currency);
  if (d === undefined) {
    try {
      d = new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 2;
    } catch {
      d = 2;
    }
    digitsCache.set(currency, d);
  }
  return d;
}

export function formatMoney(amount: Minor, currency: string, opts: { signed?: boolean } = {}): string {
  const d = currencyDigits(currency);
  const value = amount / 10 ** d;
  let s: string;
  try {
    s = new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    }).format(Math.abs(value));
  } catch {
    s = `${Math.abs(value).toFixed(d)} ${currency}`;
  }
  if (amount < 0) return `−${s}`;
  if (opts.signed && amount > 0) return `+${s}`;
  return s;
}

/** Minor units → plain decimal string for inputs ("1234" → "12.34"). */
export function toDecimalString(amount: Minor, currency: string): string {
  const d = currencyDigits(currency);
  return (amount / 10 ** d).toFixed(d);
}

/**
 * Parse a user-typed decimal into minor units without floating-point drift.
 * Accepts "12", "12.5", "1,234.56". Returns null when invalid.
 */
export function parseMoney(input: string, currency: string): Minor | null {
  const s = input.replace(/[,\s_]/g, '');
  if (!/^-?\d*(\.\d*)?$/.test(s) || s === '' || s === '-' || s === '.') return null;
  const d = currencyDigits(currency);
  const neg = s.startsWith('-');
  const [intPart, frac = ''] = s.replace('-', '').split('.');
  // Round half-up on the digit past the currency precision.
  const padded = (frac + '0'.repeat(d + 1)).slice(0, d + 1);
  let minor = Number(intPart || '0') * 10 ** d + Number(padded.slice(0, d) || '0');
  if (Number(padded[d]) >= 5) minor += 1;
  return neg ? -minor : minor;
}

/**
 * Split `total` into integer parts proportional to `weights`, summing exactly to `total`
 * (largest-remainder method). `seed` rotates who receives leftover units on ties, so the
 * "extra cent" doesn't always land on the same person.
 */
export function allocate(total: Minor, weights: number[], seed = 0): Minor[] {
  const n = weights.length;
  if (n === 0) return [];
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) throw new Error('Weights must sum to a positive number');
  const sign = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const raw = weights.map((w) => (abs * w) / sumW);
  const parts = raw.map(Math.floor);
  let left = abs - parts.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r), rot: (i - seed % n + n) % n }))
    .filter((o) => weights[o.i] > 0)
    .sort((a, b) => b.frac - a.frac || a.rot - b.rot);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) parts[order[k].i] += 1;
  return parts.map((p) => p * sign);
}

/** Convert minor units between currencies using a rate (units of `to` per unit of `from`). */
export function convert(amount: Minor, from: string, to: string, rate: number): Minor {
  if (from === to) return amount;
  const scale = 10 ** (currencyDigits(to) - currencyDigits(from));
  return Math.round(amount * rate * scale);
}

/** Small, stable string hash used to seed penny rotation. */
export function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export const COMMON_CURRENCIES = [
  'INR', 'USD', 'EUR', 'GBP', 'AED', 'AUD', 'CAD', 'SGD', 'JPY', 'CHF', 'CNY', 'HKD', 'NZD',
  'SAR', 'THB', 'MYR', 'IDR', 'LKR', 'NPR', 'BDT', 'ZAR', 'BRL', 'MXN', 'SEK', 'NOK', 'DKK',
  'KRW', 'PHP', 'VND', 'TRY', 'KWD', 'QAR',
];
