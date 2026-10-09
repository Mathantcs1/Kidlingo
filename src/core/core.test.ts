import { describe, expect, it } from 'vitest';
import { groupBalances, pairwiseDebts, simplifyDebts } from './balances';
import { evaluate } from './expr';
import { decodeGroup, encodeGroup, groupToCSV } from './io';
import { groupInsights } from './insights';
import { allocate, convert, currencyDigits, parseMoney } from './money';
import { addPeriod, materializeRecurring } from './recurring';
import { computeShares, expenseNet, SplitError, validatePayers } from './split';
import type { Expense, Group } from './types';

const sum = (o: Record<string, number> | number[]) => Object.values(o).reduce((a, b) => a + b, 0);

const group: Group = {
  id: 'g1',
  name: 'Trip',
  emoji: '🏖️',
  baseCurrency: 'INR',
  members: [
    { id: 'a', name: 'Asha' },
    { id: 'b', name: 'Bala' },
    { id: 'c', name: 'Chitra' },
    { id: 'd', name: 'Dev' },
  ],
  rates: {},
  simplifyDebts: true,
  createdAt: 0,
};

let n = 0;
function exp(p: Partial<Expense>): Expense {
  n++;
  return {
    id: `e${n}`,
    groupId: 'g1',
    kind: 'expense',
    description: 'x',
    category: 'general',
    currency: 'INR',
    amount: 1000,
    fxRate: 1,
    date: '2026-10-01',
    payers: [{ memberId: 'a', amount: p.amount ?? 1000 }],
    split: { mode: 'equal', participants: ['a', 'b', 'c', 'd'] },
    createdAt: 0,
    updatedAt: 0,
    ...p,
  };
}

describe('money', () => {
  it('allocates exactly, never losing a cent', () => {
    expect(allocate(100, [1, 1, 1])).toEqual([34, 33, 33]);
    expect(sum(allocate(100, [1, 1, 1], 1))).toBe(100);
    expect(allocate(100, [1, 1, 1], 1)).not.toEqual(allocate(100, [1, 1, 1], 0));
    expect(allocate(1001, [50, 30, 20])).toEqual([501, 300, 200]);
    expect(allocate(-10, [1, 2])).toEqual([-3, -7]);
    expect(allocate(5, [0, 1])).toEqual([0, 5]);
  });

  it('parses money without float drift and respects currency precision', () => {
    expect(parseMoney('0.1', 'USD')).toBe(10);
    expect(parseMoney('1,234.565', 'USD')).toBe(123457);
    expect(parseMoney('19.99', 'USD')).toBe(1999);
    expect(parseMoney('1500', 'JPY')).toBe(1500);
    expect(currencyDigits('JPY')).toBe(0);
    expect(parseMoney('abc', 'USD')).toBeNull();
  });

  it('converts across currencies with different precisions', () => {
    expect(convert(1000, 'JPY', 'INR', 0.56)).toBe(56000); // ¥1000 → ₹560.00
    expect(convert(1000, 'USD', 'INR', 83.25)).toBe(83250); // $10 → ₹832.50
  });

  it('evaluates calculator expressions safely', () => {
    expect(evaluate('120+45.5')).toBe(165.5);
    expect(evaluate('3*(250-50)/2')).toBe(300);
    expect(evaluate('1/0')).toBeNull();
    expect(evaluate('alert(1)')).toBeNull();
    expect(evaluate('2+')).toBeNull();
  });
});

describe('splits', () => {
  it('equal split sums to the total', () => {
    const s = computeShares(1000, { mode: 'equal', participants: ['a', 'b', 'c'] }, 'x');
    expect(sum(s)).toBe(1000);
    expect(Object.values(s).sort()).toEqual([333, 333, 334]);
  });

  it('rotates the leftover cent between expenses', () => {
    const winners = new Set<string>();
    for (let i = 0; i < 30; i++) {
      const s = computeShares(100, { mode: 'equal', participants: ['a', 'b', 'c'] }, `seed${i}`);
      winners.add(Object.entries(s).find(([, v]) => v === 34)![0]);
    }
    expect(winners.size).toBe(3);
  });

  it('exact split must match the total', () => {
    expect(computeShares(1000, { mode: 'exact', participants: ['a', 'b'], values: { a: 700, b: 300 } })).toEqual({ a: 700, b: 300 });
    expect(() => computeShares(1000, { mode: 'exact', participants: ['a', 'b'], values: { a: 700, b: 200 } })).toThrow(SplitError);
  });

  it('percent split must add to 100', () => {
    const s = computeShares(999, { mode: 'percent', participants: ['a', 'b', 'c'], values: { a: 50, b: 25, c: 25 } });
    expect(sum(s)).toBe(999);
    expect(() => computeShares(1000, { mode: 'percent', participants: ['a'], values: { a: 90 } })).toThrow(/100%/);
  });

  it('shares split by weight', () => {
    expect(computeShares(900, { mode: 'shares', participants: ['a', 'b'], values: { a: 2, b: 1 } })).toEqual({ a: 600, b: 300 });
  });

  it('adjustment split adds extras on top of an equal split', () => {
    // a had an extra 200 drink; the rest (800) is split equally.
    expect(computeShares(1000, { mode: 'adjust', participants: ['a', 'b'], values: { a: 200 } })).toEqual({ a: 600, b: 400 });
  });

  it('itemized split spreads tax and tip proportionally', () => {
    const s = computeShares(1200, {
      mode: 'itemized',
      participants: [],
      items: [
        { id: '1', name: 'Pizza', amount: 600, memberIds: ['a', 'b'] },
        { id: '2', name: 'Wine', amount: 400, memberIds: ['a'] },
      ],
    });
    // subtotals a=700 b=300, extra 200 → a=140 b=60
    expect(s).toEqual({ a: 840, b: 360 });
  });

  it('validates payers', () => {
    expect(validatePayers(1000, [{ memberId: 'a', amount: 600 }, { memberId: 'b', amount: 400 }])).toBeNull();
    expect(validatePayers(1000, [{ memberId: 'a', amount: 600 }])).toMatch(/add up/);
    expect(validatePayers(1000, [])).toMatch(/who paid/);
  });

  it('expense net is zero-sum', () => {
    const e = exp({ amount: 1001, payers: [{ memberId: 'a', amount: 501 }, { memberId: 'b', amount: 500 }] });
    expect(sum(expenseNet(e))).toBe(0);
  });
});

describe('balances', () => {
  const expenses = [
    exp({ amount: 4000 }), // a pays 40 for everyone
    exp({ amount: 2000, payers: [{ memberId: 'b', amount: 2000 }], split: { mode: 'equal', participants: ['b', 'c'] } }),
    exp({ kind: 'payment', amount: 500, payers: [{ memberId: 'd', amount: 500 }], split: { mode: 'exact', participants: ['a'], values: { a: 500 } } }),
    exp({ amount: 1000, deletedAt: 1 }),
  ];

  it('computes net balances that sum to zero and ignore deleted items', () => {
    const b = groupBalances(group, expenses);
    expect(b).toEqual({ a: 2500, b: 0, c: -2000, d: -500 });
    expect(sum(b)).toBe(0);
  });

  it('simplifies to at most n-1 transfers that settle everyone', () => {
    const b = { a: 5000, b: -1000, c: -1500, d: -2500 };
    const t = simplifyDebts(b);
    expect(t.length).toBeLessThanOrEqual(3);
    const after = { ...b } as Record<string, number>;
    for (const x of t) {
      after[x.from] += x.amount;
      after[x.to] -= x.amount;
    }
    expect(Object.values(after).every((v) => v === 0)).toBe(true);
  });

  it('pairwise debts agree with net balances', () => {
    const t = pairwiseDebts(group, expenses);
    const net: Record<string, number> = { a: 0, b: 0, c: 0, d: 0 };
    for (const x of t) {
      net[x.from] -= x.amount;
      net[x.to] += x.amount;
    }
    expect(net).toEqual(groupBalances(group, expenses));
  });

  it('keeps multi-currency balances exactly zero-sum', () => {
    const fx = [exp({ currency: 'USD', amount: 1001, fxRate: 83.17 }), exp({ currency: 'JPY', amount: 777, fxRate: 0.561 })];
    expect(sum(groupBalances(group, fx))).toBe(0);
  });
});

describe('recurring', () => {
  it('clamps month ends', () => {
    expect(addPeriod('2026-01-31', 'monthly')).toBe('2026-02-28');
    expect(addPeriod('2026-12-30', 'weekly')).toBe('2027-01-06');
    expect(addPeriod('2028-02-29', 'yearly')).toBe('2029-02-28');
  });

  it('creates due occurrences and advances the template', () => {
    const t = exp({ date: '2026-08-01', recurring: { freq: 'monthly', nextDate: '2026-09-01' } });
    let k = 0;
    const { created, updated } = materializeRecurring([t], '2026-10-09', () => `r${k++}`);
    expect(created.map((c) => c.date)).toEqual(['2026-09-01', '2026-10-01']);
    expect(created.every((c) => !c.recurring && c.recurringSourceId === t.id)).toBe(true);
    expect(updated[0].recurring!.nextDate).toBe('2026-11-01');
  });
});

describe('insights & io', () => {
  const list = [exp({ amount: 4000, category: 'food', date: '2026-10-02' }), exp({ amount: 1000, category: 'transport', date: '2026-09-02' })];

  it('aggregates by category and month, or by one member’s share', () => {
    const i = groupInsights(group, list, '2026-10-09');
    expect(i.total).toBe(5000);
    expect(i.thisMonth).toBe(4000);
    expect(i.byCategory[0]).toEqual({ category: 'food', amount: 4000 });
    expect(groupInsights(group, list, '2026-10-09', 'b').total).toBe(1250);
  });

  it('exports CSV with escaped cells', () => {
    const csv = groupToCSV(group, [exp({ description: 'Dinner, "fancy"' })]);
    expect(csv.split('\n')[1]).toContain('"Dinner, ""fancy"""');
  });

  it('round-trips a group through a share link', async () => {
    const code = await encodeGroup(group, list);
    const back = await decodeGroup(code);
    expect(back.group).toEqual(group);
    expect(back.expenses).toHaveLength(2);
  });
});
