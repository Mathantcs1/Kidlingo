import type { Expense, Frequency } from './types';

export function addPeriod(date: string, freq: Frequency): string {
  const [y, m, d] = date.split('-').map(Number);
  if (freq === 'weekly') {
    const t = new Date(Date.UTC(y, m - 1, d + 7));
    return t.toISOString().slice(0, 10);
  }
  const months = freq === 'monthly' ? 1 : 12;
  const targetMonth = m - 1 + months;
  // Clamp to month end so Jan 31 → Feb 28/29 → Mar 31 doesn't drift.
  const lastDay = new Date(Date.UTC(y, targetMonth + 1, 0)).getUTCDate();
  const t = new Date(Date.UTC(y, targetMonth, Math.min(d, lastDay)));
  return t.toISOString().slice(0, 10);
}

/**
 * Create any recurring occurrences that are due on or before `today`.
 * Returns the new expenses and the updated templates (with advanced nextDate); does not mutate input.
 */
export function materializeRecurring(
  expenses: Expense[],
  today: string,
  newId: () => string,
  now = Date.now(),
): { created: Expense[]; updated: Expense[] } {
  const created: Expense[] = [];
  const updated: Expense[] = [];
  for (const e of expenses) {
    if (!e.recurring || e.deletedAt || e.recurring.nextDate > today) continue;
    let next = e.recurring.nextDate;
    for (let guard = 0; next <= today && guard < 500; guard++) {
      const { recurring: _r, ...rest } = e;
      void _r;
      created.push({ ...rest, id: newId(), date: next, recurringSourceId: e.id, createdAt: now, updatedAt: now });
      next = addPeriod(next, e.recurring.freq);
    }
    updated.push({ ...e, recurring: { ...e.recurring, nextDate: next }, updatedAt: now });
  }
  return { created, updated };
}

export function todayISO(d = new Date()): string {
  const off = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - off).toISOString().slice(0, 10);
}
