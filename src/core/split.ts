import { allocate, hashString } from './money';
import type { Expense, ID, Minor, Payer, Split } from './types';

export class SplitError extends Error {}

/**
 * Compute how much each member owes for `amount` under `split`.
 * The result always sums exactly to `amount` (no lost or invented cents).
 * Throws SplitError with a human-readable message when the split is invalid.
 */
export function computeShares(amount: Minor, split: Split, seedKey = ''): Record<ID, Minor> {
  if (!Number.isInteger(amount) || amount <= 0) throw new SplitError('Amount must be greater than zero');
  const seed = hashString(seedKey);
  const v = split.values ?? {};
  const people = split.participants;
  const out: Record<ID, Minor> = {};
  const assign = (ids: ID[], parts: Minor[]) => ids.forEach((id, i) => (out[id] = (out[id] ?? 0) + parts[i]));

  switch (split.mode) {
    case 'equal': {
      if (people.length === 0) throw new SplitError('Choose at least one person to split with');
      assign(people, allocate(amount, people.map(() => 1), seed));
      break;
    }
    case 'exact': {
      const ids = people.filter((id) => (v[id] ?? 0) !== 0);
      const sum = ids.reduce((s, id) => s + (v[id] ?? 0), 0);
      if (ids.some((id) => v[id] < 0)) throw new SplitError('Amounts cannot be negative');
      if (sum !== amount) throw new SplitError(`Amounts add up to ${sum} but the total is ${amount}`);
      ids.forEach((id) => (out[id] = v[id]));
      break;
    }
    case 'percent': {
      const ids = people.filter((id) => (v[id] ?? 0) > 0);
      const sum = ids.reduce((s, id) => s + v[id], 0);
      if (Math.abs(sum - 100) > 1e-6) throw new SplitError(`Percentages add up to ${round2(sum)}%, not 100%`);
      assign(ids, allocate(amount, ids.map((id) => v[id]), seed));
      break;
    }
    case 'shares': {
      const ids = people.filter((id) => (v[id] ?? 0) > 0);
      if (ids.length === 0) throw new SplitError('Give at least one person a share');
      if (people.some((id) => (v[id] ?? 0) < 0)) throw new SplitError('Shares cannot be negative');
      assign(ids, allocate(amount, ids.map((id) => v[id]), seed));
      break;
    }
    case 'adjust': {
      // Everyone splits what's left equally after their individual +/- adjustments.
      if (people.length === 0) throw new SplitError('Choose at least one person to split with');
      const adj = people.map((id) => Math.round(v[id] ?? 0));
      const rest = amount - adj.reduce((a, b) => a + b, 0);
      const base = allocate(rest, people.map(() => 1), seed);
      people.forEach((id, i) => (out[id] = base[i] + adj[i]));
      if (people.some((id) => out[id] < 0)) throw new SplitError('Adjustments make someone’s share negative');
      break;
    }
    case 'itemized': {
      const items = split.items ?? [];
      if (items.length === 0) throw new SplitError('Add at least one item');
      for (const it of items) {
        if (!(it.amount > 0)) throw new SplitError(`Item “${it.name || 'unnamed'}” needs a price`);
        if (it.memberIds.length === 0) throw new SplitError(`Assign “${it.name || 'unnamed'}” to someone`);
      }
      const sub: Record<ID, Minor> = {};
      items.forEach((it, k) => {
        const parts = allocate(it.amount, it.memberIds.map(() => 1), seed + k);
        it.memberIds.forEach((id, i) => (sub[id] = (sub[id] ?? 0) + parts[i]));
      });
      const ids = Object.keys(sub);
      const itemsTotal = ids.reduce((s, id) => s + sub[id], 0);
      // Tax, tip, service charge (or a discount, if negative) — shared in proportion to what each person ordered.
      const extra = amount - itemsTotal;
      if (extra < -itemsTotal) throw new SplitError('Total is less than zero after discount');
      const extraParts = extra === 0 ? ids.map(() => 0) : allocate(extra, ids.map((id) => sub[id]), seed);
      ids.forEach((id, i) => (out[id] = sub[id] + extraParts[i]));
      break;
    }
  }
  for (const id of Object.keys(out)) if (out[id] === 0) delete out[id];
  return out;
}

export function validatePayers(amount: Minor, payers: Payer[]): string | null {
  const active = payers.filter((p) => p.amount !== 0);
  if (active.length === 0) return 'Choose who paid';
  if (active.some((p) => p.amount < 0)) return 'Paid amounts cannot be negative';
  const sum = active.reduce((s, p) => s + p.amount, 0);
  if (sum !== amount) return 'Amounts paid don’t add up to the total';
  return null;
}

/** Per-member net effect of one expense in its own currency: positive = is owed, negative = owes. */
export function expenseNet(e: Pick<Expense, 'id' | 'amount' | 'payers' | 'split'>): Record<ID, Minor> {
  const shares = computeShares(e.amount, e.split, e.id);
  const net: Record<ID, Minor> = {};
  for (const p of e.payers) net[p.memberId] = (net[p.memberId] ?? 0) + p.amount;
  for (const [id, s] of Object.entries(shares)) net[id] = (net[id] ?? 0) - s;
  return net;
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
