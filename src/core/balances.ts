import { allocate, convert, hashString } from './money';
import { computeShares } from './split';
import type { Expense, Group, ID, Minor } from './types';

export interface Transfer {
  from: ID;
  to: ID;
  amount: Minor;
}

/**
 * One expense's shares and payments expressed in the group's base currency.
 * Both sides are rounded with the same total, so every expense stays exactly zero-sum after conversion.
 */
export function expenseInBase(e: Expense, base: string): { paid: Record<ID, Minor>; owed: Record<ID, Minor>; total: Minor } {
  const shares = computeShares(e.amount, e.split, e.id);
  const total = convert(e.amount, e.currency, base, e.fxRate);
  const seed = hashString(e.id);
  const owedIds = Object.keys(shares);
  const owedParts = e.currency === base ? owedIds.map((id) => shares[id]) : allocate(total, owedIds.map((id) => shares[id]), seed);
  const payers = e.payers.filter((p) => p.amount > 0);
  const paidParts = e.currency === base ? payers.map((p) => p.amount) : allocate(total, payers.map((p) => p.amount), seed);
  const paid: Record<ID, Minor> = {};
  const owed: Record<ID, Minor> = {};
  payers.forEach((p, i) => (paid[p.memberId] = (paid[p.memberId] ?? 0) + paidParts[i]));
  owedIds.forEach((id, i) => (owed[id] = owedParts[i]));
  return { paid, owed, total };
}

const live = (expenses: Expense[], groupId: ID) => expenses.filter((e) => e.groupId === groupId && !e.deletedAt);

/** Net balance per member in base currency. Positive = gets money back, negative = owes. Always sums to 0. */
export function groupBalances(group: Group, expenses: Expense[]): Record<ID, Minor> {
  const net: Record<ID, Minor> = Object.fromEntries(group.members.map((m) => [m.id, 0]));
  for (const e of live(expenses, group.id)) {
    const { paid, owed } = expenseInBase(e, group.baseCurrency);
    for (const [id, a] of Object.entries(paid)) net[id] = (net[id] ?? 0) + a;
    for (const [id, a] of Object.entries(owed)) net[id] = (net[id] ?? 0) - a;
  }
  return net;
}

/**
 * Fewest-transfers settlement plan: repeatedly match the largest debtor with the largest creditor.
 * Produces at most (n − 1) transfers for n people with non-zero balances.
 */
export function simplifyDebts(balances: Record<ID, Minor>): Transfer[] {
  const creditors = Object.entries(balances).filter(([, v]) => v > 0).map(([id, v]) => ({ id, v }));
  const debtors = Object.entries(balances).filter(([, v]) => v < 0).map(([id, v]) => ({ id, v: -v }));
  const out: Transfer[] = [];
  const byAmount = (a: { id: ID; v: number }, b: { id: ID; v: number }) => b.v - a.v || a.id.localeCompare(b.id);
  while (creditors.length && debtors.length) {
    creditors.sort(byAmount);
    debtors.sort(byAmount);
    const c = creditors[0];
    const d = debtors[0];
    const amt = Math.min(c.v, d.v);
    out.push({ from: d.id, to: c.id, amount: amt });
    c.v -= amt;
    d.v -= amt;
    if (c.v === 0) creditors.shift();
    if (d.v === 0) debtors.shift();
  }
  return out;
}

/**
 * Who owes whom without simplification: each person owes each payer of an expense
 * in proportion to what that payer covered, then opposite debts between a pair cancel out.
 */
export function pairwiseDebts(group: Group, expenses: Expense[]): Transfer[] {
  const pair = new Map<string, Minor>(); // key "debtor|creditor"
  const add = (from: ID, to: ID, amt: Minor) => {
    if (from === to || amt === 0) return;
    const k = `${from}|${to}`;
    pair.set(k, (pair.get(k) ?? 0) + amt);
  };
  for (const e of live(expenses, group.id)) {
    const { paid, owed } = expenseInBase(e, group.baseCurrency);
    const payerIds = Object.keys(paid);
    const seed = hashString(e.id);
    for (const [debtor, share] of Object.entries(owed)) {
      const parts = allocate(share, payerIds.map((p) => paid[p]), seed);
      payerIds.forEach((p, i) => add(debtor, p, parts[i]));
    }
  }
  const out: Transfer[] = [];
  const seen = new Set<string>();
  for (const [k, amt] of pair) {
    const [a, b] = k.split('|');
    const rev = `${b}|${a}`;
    if (seen.has(rev)) continue;
    seen.add(k);
    const net = amt - (pair.get(rev) ?? 0);
    if (net > 0) out.push({ from: a, to: b, amount: net });
    else if (net < 0) out.push({ from: b, to: a, amount: -net });
  }
  return out.sort((x, y) => y.amount - x.amount);
}

export function settlementPlan(group: Group, expenses: Expense[]): Transfer[] {
  return group.simplifyDebts ? simplifyDebts(groupBalances(group, expenses)) : pairwiseDebts(group, expenses);
}

export interface MemberStats {
  paid: Minor; // spent out of pocket on expenses (not payments)
  share: Minor; // their fair share of expenses
  sentPayments: Minor;
  receivedPayments: Minor;
}

export function memberStats(group: Group, expenses: Expense[]): Record<ID, MemberStats> {
  const stats: Record<ID, MemberStats> = Object.fromEntries(
    group.members.map((m) => [m.id, { paid: 0, share: 0, sentPayments: 0, receivedPayments: 0 }]),
  );
  const get = (id: ID) => (stats[id] ??= { paid: 0, share: 0, sentPayments: 0, receivedPayments: 0 });
  for (const e of live(expenses, group.id)) {
    const { paid, owed } = expenseInBase(e, group.baseCurrency);
    for (const [id, a] of Object.entries(paid)) e.kind === 'payment' ? (get(id).sentPayments += a) : (get(id).paid += a);
    for (const [id, a] of Object.entries(owed)) e.kind === 'payment' ? (get(id).receivedPayments += a) : (get(id).share += a);
  }
  return stats;
}
