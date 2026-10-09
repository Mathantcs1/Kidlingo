import { expenseInBase } from './balances';
import type { Expense, Group, ID, Minor } from './types';

export interface Insights {
  total: Minor;
  count: number;
  byCategory: { category: string; amount: Minor }[];
  byMonth: { month: string; amount: Minor }[];
  thisMonth: Minor;
  largest?: Expense;
}

/** Spending analytics for a group (payments between members are excluded — they're not spending). */
export function groupInsights(group: Group, expenses: Expense[], today: string, memberId?: ID): Insights {
  const list = expenses.filter((e) => e.groupId === group.id && !e.deletedAt && e.kind === 'expense');
  const cat = new Map<string, Minor>();
  const month = new Map<string, Minor>();
  let total = 0;
  let largest: Expense | undefined;
  let largestAmt = -1;
  const curMonth = today.slice(0, 7);
  let thisMonth = 0;
  let count = 0;
  for (const e of list) {
    const { owed, total: t } = expenseInBase(e, group.baseCurrency);
    // With a member selected, count only that person's share — "what did *I* spend?"
    const amt = memberId ? owed[memberId] ?? 0 : t;
    if (amt === 0) continue;
    count++;
    total += amt;
    cat.set(e.category, (cat.get(e.category) ?? 0) + amt);
    const m = e.date.slice(0, 7);
    month.set(m, (month.get(m) ?? 0) + amt);
    if (m === curMonth) thisMonth += amt;
    if (amt > largestAmt) {
      largestAmt = amt;
      largest = e;
    }
  }
  return {
    total,
    count,
    byCategory: [...cat].map(([category, amount]) => ({ category, amount })).sort((a, b) => b.amount - a.amount),
    byMonth: [...month].map(([m, amount]) => ({ month: m, amount })).sort((a, b) => a.month.localeCompare(b.month)).slice(-12),
    thisMonth,
    largest,
  };
}
