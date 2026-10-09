import { useMemo, useState } from 'react';
import { expenseInBase, groupBalances, memberStats, pairwiseDebts, settlementPlan, simplifyDebts, type Transfer } from '../core/balances';
import { groupInsights } from '../core/insights';
import { download, encodeGroup, groupToCSV } from '../core/io';
import { formatMoney, toDecimalString } from '../core/money';
import { todayISO } from '../core/recurring';
import type { Expense, Group, ID, Member } from '../core/types';
import { CATEGORIES, categoryOf } from '../core/types';
import { newId, useAppState, useDispatch } from '../state/store';
import { ExpenseForm } from './ExpenseForm';
import { SettleForm } from './SettleForm';
import { Avatar, Empty, Money, MoneyInput, useToast } from './ui';

type Tab = 'expenses' | 'balances' | 'insights' | 'settings';

export function GroupView({ group, onBack }: { group: Group; onBack: () => void }) {
  const { expenses } = useAppState();
  const [tab, setTab] = useState<Tab>('expenses');
  const [editing, setEditing] = useState<Expense | 'new' | null>(null);
  const [settle, setSettle] = useState<Partial<Transfer> | null>(null);

  const balances = useMemo(() => groupBalances(group, expenses), [group, expenses]);
  const me = group.meId;
  const myBalance = me ? balances[me] ?? 0 : null;

  return (
    <div className="group-view">
      <div className="group-head">
        <button className="icon-btn" onClick={onBack} aria-label="Back to groups">
          ←
        </button>
        <span className="group-emoji">{group.emoji}</span>
        <div className="grow">
          <h1>{group.name}</h1>
          <p className="muted small">
            {group.members.length} people ·{' '}
            {myBalance === null ? (
              'pick “who am I” in Settings'
            ) : myBalance === 0 ? (
              'you are all settled up'
            ) : myBalance > 0 ? (
              <>
                you are owed <Money amount={myBalance} currency={group.baseCurrency} tone />
              </>
            ) : (
              <>
                you owe <Money amount={-myBalance} currency={group.baseCurrency} />
              </>
            )}
          </p>
        </div>
        <div className="head-actions">
          <button className="btn" onClick={() => setSettle({})} disabled={group.members.length < 2}>
            Settle up
          </button>
          <button className="btn primary" onClick={() => setEditing('new')} disabled={group.members.length === 0}>
            + Expense
          </button>
        </div>
      </div>

      <nav className="tabs" role="tablist">
        {(['expenses', 'balances', 'insights', 'settings'] as Tab[]).map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} className={tab === t ? 'on' : ''} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>

      {tab === 'expenses' && <ExpenseList group={group} onEdit={setEditing} onAdd={() => setEditing('new')} />}
      {tab === 'balances' && <Balances group={group} balances={balances} onSettle={setSettle} />}
      {tab === 'insights' && <InsightsTab group={group} />}
      {tab === 'settings' && <GroupSettings group={group} balances={balances} onDeleted={onBack} />}

      <button className="fab" onClick={() => setEditing('new')} aria-label="Add expense" disabled={group.members.length === 0}>
        +
      </button>

      {editing && <ExpenseForm group={group} expense={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} />}
      {settle && <SettleForm group={group} from={settle.from} to={settle.to} amount={settle.amount} onClose={() => setSettle(null)} />}
    </div>
  );
}

// ---------------- Expenses ----------------

function ExpenseList({ group, onEdit, onAdd }: { group: Group; onEdit: (e: Expense) => void; onAdd: () => void }) {
  const { expenses } = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [who, setWho] = useState('');
  const [open, setOpen] = useState<ID | null>(null);

  const all = expenses.filter((e) => e.groupId === group.id && !e.deletedAt);
  const list = all
    .filter((e) => !q || `${e.description} ${e.notes ?? ''}`.toLowerCase().includes(q.toLowerCase()))
    .filter((e) => !cat || (cat === 'payment' ? e.kind === 'payment' : e.category === cat && e.kind === 'expense'))
    .filter((e) => !who || e.payers.some((p) => p.memberId === who) || e.split.participants.includes(who) || e.split.items?.some((i) => i.memberIds.includes(who)))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  const months = new Map<string, Expense[]>();
  for (const e of list) {
    const k = e.date.slice(0, 7);
    months.set(k, [...(months.get(k) ?? []), e]);
  }
  const name = (id: ID) => (id === group.meId ? 'You' : group.members.find((m) => m.id === id)?.name ?? 'Former member');

  const remove = (e: Expense) => {
    dispatch({ type: 'expense/delete', id: e.id });
    toast(`Deleted “${e.description}”`, { label: 'Undo', run: () => dispatch({ type: 'expense/restore', id: e.id }) });
  };

  if (all.length === 0)
    return (
      <Empty icon="🧾" title="No expenses yet">
        <p className="muted">Add as many as you like — there are no daily limits.</p>
        <button className="btn primary" onClick={onAdd}>
          Add the first expense
        </button>
      </Empty>
    );

  return (
    <section>
      <div className="filters">
        <input type="search" placeholder="Search expenses & notes" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search" />
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filter by category">
          <option value="">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.icon} {c.label}
            </option>
          ))}
          <option value="payment">💸 Payments</option>
        </select>
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="Filter by person">
          <option value="">Everyone</option>
          {group.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>
      {list.length === 0 && <p className="muted center">Nothing matches those filters.</p>}
      {[...months].map(([month, items]) => (
        <div key={month} className="month">
          <h3 className="month-label">{new Date(`${month}-01T00:00`).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h3>
          <ul className="exp-list">
            {items.map((e) => {
              const { paid, owed, total } = expenseInBase(e, group.baseCurrency);
              const mine = group.meId ? (paid[group.meId] ?? 0) - (owed[group.meId] ?? 0) : null;
              const isPay = e.kind === 'payment';
              const payerNames = e.payers.filter((p) => p.amount > 0).map((p) => name(p.memberId));
              const d = new Date(`${e.date}T00:00`);
              return (
                <li key={e.id} className={`exp ${isPay ? 'payment' : ''}`}>
                  <button className="exp-main" onClick={() => setOpen(open === e.id ? null : e.id)} aria-expanded={open === e.id}>
                    <span className="exp-date">
                      <small>{d.toLocaleDateString(undefined, { month: 'short' })}</small>
                      {d.getDate()}
                    </span>
                    <span className="exp-icon">{isPay ? '💸' : categoryOf(e.category).icon}</span>
                    <span className="exp-text">
                      <strong>
                        {e.description}
                        {(e.recurring || e.recurringSourceId) && <span title="Recurring"> 🔁</span>}
                      </strong>
                      <small className="muted">
                        {isPay
                          ? `${formatMoney(e.amount, e.currency)}`
                          : `${payerNames.length > 2 ? `${payerNames.length} people` : payerNames.join(' & ')} paid ${formatMoney(e.amount, e.currency)}`}
                        {e.currency !== group.baseCurrency && ` (≈ ${formatMoney(total, group.baseCurrency)})`}
                      </small>
                    </span>
                    {mine !== null && !isPay && (
                      <span className={`exp-mine ${mine > 0 ? 'pos' : mine < 0 ? 'neg' : 'zero'}`}>
                        <small>{mine > 0 ? 'you lent' : mine < 0 ? 'you borrowed' : 'not involved'}</small>
                        {mine !== 0 && formatMoney(Math.abs(mine), group.baseCurrency)}
                      </span>
                    )}
                  </button>
                  {open === e.id && (
                    <div className="exp-detail">
                      <table>
                        <tbody>
                          {group.members
                            .filter((m) => paid[m.id] || owed[m.id])
                            .map((m) => (
                              <tr key={m.id}>
                                <td>
                                  <Avatar member={m} size={20} /> {name(m.id)}
                                </td>
                                <td className="muted">{paid[m.id] ? `paid ${formatMoney(paid[m.id], group.baseCurrency)}` : ''}</td>
                                <td className="muted">{owed[m.id] ? `${isPay ? 'received' : 'share'} ${formatMoney(owed[m.id], group.baseCurrency)}` : ''}</td>
                              </tr>
                            ))}
                        </tbody>
                      </table>
                      {e.split.mode === 'itemized' && (
                        <p className="muted small">Items: {e.split.items?.map((i) => `${i.name || 'item'} ${formatMoney(i.amount, e.currency)}`).join(', ')}</p>
                      )}
                      {e.notes && <p className="note">📝 {e.notes}</p>}
                      {e.recurring && <p className="muted small">Repeats {e.recurring.freq} · next on {e.recurring.nextDate}</p>}
                      <p className="muted small">
                        Added {new Date(e.createdAt).toLocaleString()}
                        {e.updatedAt - e.createdAt > 1000 && ` · edited ${new Date(e.updatedAt).toLocaleString()}`}
                      </p>
                      <div className="row-actions">
                        {!isPay && (
                          <button className="btn small" onClick={() => onEdit(e)}>
                            Edit
                          </button>
                        )}
                        {!isPay && (
                          <button
                            className="btn small"
                            onClick={() => {
                              const now = Date.now();
                              const { recurring: _r, recurringSourceId: _s, ...rest } = e;
                              void _r;
                              void _s;
                              onEdit({ ...rest, id: newId(), date: todayISO(), createdAt: now, updatedAt: now });
                            }}
                          >
                            Duplicate
                          </button>
                        )}
                        <button className="btn small danger" onClick={() => remove(e)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}

// ---------------- Balances ----------------

function Balances({ group, balances, onSettle }: { group: Group; balances: Record<ID, number>; onSettle: (t: Partial<Transfer>) => void }) {
  const { expenses } = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const cur = group.baseCurrency;
  const plan = useMemo(() => settlementPlan(group, expenses), [group, expenses]);
  const raw = useMemo(() => pairwiseDebts(group, expenses).length, [group, expenses]);
  const simplified = useMemo(() => simplifyDebts(balances).length, [balances]);
  const stats = useMemo(() => memberStats(group, expenses), [group, expenses]);
  const member = (id: ID): Member | undefined => group.members.find((m) => m.id === id);
  const label = (id: ID) => (id === group.meId ? 'You' : member(id)?.name ?? 'Former member');

  const remind = async (t: Transfer) => {
    const to = member(t.to);
    const amt = formatMoney(t.amount, cur);
    let text = `Hi ${member(t.from)?.name}! Quick reminder from “${group.name}”: you owe ${to?.name} ${amt}.`;
    if (to?.upi && cur === 'INR') text += `\nPay via UPI: upi://pay?pa=${encodeURIComponent(to.upi)}&pn=${encodeURIComponent(to.name)}&am=${toDecimalString(t.amount, cur)}&cu=INR`;
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        /* user cancelled — fall back to clipboard */
      }
    }
    await navigator.clipboard?.writeText(text);
    toast('Reminder copied — paste it in any chat');
  };

  const sorted = [...group.members].sort((a, b) => (balances[b.id] ?? 0) - (balances[a.id] ?? 0));
  const maxAbs = Math.max(1, ...Object.values(balances).map(Math.abs));

  return (
    <section className="stack">
      <div className="card">
        <h3>Balances</h3>
        <ul className="bal-list">
          {sorted.map((m) => {
            const b = balances[m.id] ?? 0;
            return (
              <li key={m.id}>
                <Avatar member={m} />
                <span className="grow">{label(m.id)}</span>
                <span className="bal-bar" aria-hidden>
                  <span className={b >= 0 ? 'pos' : 'neg'} style={{ width: `${(Math.abs(b) / maxAbs) * 50}%`, [b >= 0 ? 'left' : 'right']: '50%' }} />
                </span>
                <span className="bal-amt">
                  <small className="muted">{b > 0 ? 'gets back' : b < 0 ? 'owes' : 'settled'}</small>
                  <Money amount={Math.abs(b)} currency={cur} tone={false} />
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card">
        <div className="card-head">
          <h3>How to settle up</h3>
          <label className="toggle">
            <input type="checkbox" checked={group.simplifyDebts} onChange={(e) => dispatch({ type: 'group/upsert', group: { ...group, simplifyDebts: e.target.checked } })} />
            Simplify debts
          </label>
        </div>
        <p className="muted small">
          {group.simplifyDebts
            ? `Simplified: ${simplified} payment${simplified === 1 ? '' : 's'} instead of ${raw}. Everyone ends up with exactly the same balance — only who pays whom changes.`
            : `Showing who owes whom directly, based on who paid for what (${raw} payment${raw === 1 ? '' : 's'}). Turn on “Simplify” to minimise transfers.`}
        </p>
        {plan.length === 0 ? (
          <p className="center">🎉 Everyone is settled up.</p>
        ) : (
          <ul className="plan">
            {plan.map((t) => (
              <li key={`${t.from}-${t.to}`}>
                <Avatar member={member(t.from)} size={28} />
                <span className="grow">
                  <strong>{label(t.from)}</strong> {t.from === group.meId ? 'pay' : 'pays'} <strong>{label(t.to)}</strong>
                </span>
                <Money amount={t.amount} currency={cur} />
                <span className="plan-actions">
                  <button className="btn small" onClick={() => remind(t)}>
                    Remind
                  </button>
                  <button className="btn small primary" onClick={() => onSettle(t)}>
                    Settle
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3>Who paid what</h3>
        <table className="stats">
          <thead>
            <tr>
              <th>Person</th>
              <th>Paid</th>
              <th>Fair share</th>
              <th>Payments sent / received</th>
            </tr>
          </thead>
          <tbody>
            {group.members.map((m) => (
              <tr key={m.id}>
                <td>{label(m.id)}</td>
                <td>{formatMoney(stats[m.id]?.paid ?? 0, cur)}</td>
                <td>{formatMoney(stats[m.id]?.share ?? 0, cur)}</td>
                <td className="muted">
                  {formatMoney(stats[m.id]?.sentPayments ?? 0, cur)} / {formatMoney(stats[m.id]?.receivedPayments ?? 0, cur)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ---------------- Insights ----------------

function InsightsTab({ group }: { group: Group }) {
  const { expenses } = useAppState();
  const [who, setWho] = useState<ID>('');
  const today = todayISO();
  const ins = useMemo(() => groupInsights(group, expenses, today, who || undefined), [group, expenses, today, who]);
  const cur = group.baseCurrency;
  const maxCat = Math.max(1, ...ins.byCategory.map((c) => c.amount));
  const maxMonth = Math.max(1, ...ins.byMonth.map((m) => m.amount));
  const budget = group.monthlyBudget;
  const groupThisMonth = useMemo(() => (who ? groupInsights(group, expenses, today).thisMonth : ins.thisMonth), [who, group, expenses, today, ins.thisMonth]);

  if (ins.count === 0 && !who) return <Empty icon="📊" title="No spending yet">Charts appear once you add expenses.</Empty>;

  return (
    <section className="stack">
      <div className="filters">
        <select value={who} onChange={(e) => setWho(e.target.value)} aria-label="View for">
          <option value="">Whole group</option>
          {group.members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === group.meId ? 'My share' : `${m.name}’s share`}
            </option>
          ))}
        </select>
      </div>
      <div className="kpis">
        <div className="kpi">
          <small>Total spent</small>
          <strong>{formatMoney(ins.total, cur)}</strong>
        </div>
        <div className="kpi">
          <small>This month</small>
          <strong>{formatMoney(ins.thisMonth, cur)}</strong>
        </div>
        <div className="kpi">
          <small>Expenses</small>
          <strong>{ins.count}</strong>
        </div>
        <div className="kpi">
          <small>Biggest</small>
          <strong title={ins.largest?.description}>{ins.largest ? ins.largest.description : '—'}</strong>
        </div>
      </div>

      {budget ? (
        <div className="card">
          <div className="card-head">
            <h3>Monthly budget</h3>
            <span className="muted small">
              {formatMoney(groupThisMonth, cur)} of {formatMoney(budget, cur)}
            </span>
          </div>
          <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={budget} aria-valuenow={groupThisMonth}>
            <span className={groupThisMonth > budget ? 'over' : groupThisMonth > budget * 0.8 ? 'near' : ''} style={{ width: `${Math.min(100, (groupThisMonth / budget) * 100)}%` }} />
          </div>
          <p className="muted small">
            {groupThisMonth > budget ? `Over budget by ${formatMoney(groupThisMonth - budget, cur)}` : `${formatMoney(budget - groupThisMonth, cur)} left this month`}
          </p>
        </div>
      ) : null}

      <div className="card">
        <h3>By category</h3>
        <ul className="bars">
          {ins.byCategory.map((c) => (
            <li key={c.category}>
              <span className="bar-label">
                {categoryOf(c.category).icon} {categoryOf(c.category).label}
              </span>
              <span className="bar-track">
                <span className="bar" style={{ width: `${(c.amount / maxCat) * 100}%` }} />
              </span>
              <span className="bar-value">
                {formatMoney(c.amount, cur)} <small className="muted">{Math.round((c.amount / Math.max(1, ins.total)) * 100)}%</small>
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="card">
        <h3>By month</h3>
        <div className="cols" role="list">
          {ins.byMonth.map((m) => (
            <div key={m.month} className="col" role="listitem" title={`${m.month}: ${formatMoney(m.amount, cur)}`}>
              <span className="col-value">{formatMoney(m.amount, cur).replace(/\.\d+$/, '')}</span>
              <span className="col-bar" style={{ height: `${(m.amount / maxMonth) * 100}%` }} />
              <span className="col-label">{new Date(`${m.month}-01T00:00`).toLocaleDateString(undefined, { month: 'short' })}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------- Settings ----------------

function GroupSettings({ group, balances, onDeleted }: { group: Group; balances: Record<ID, number>; onDeleted: () => void }) {
  const { expenses } = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const [newName, setNewName] = useState('');
  const save = (patch: Partial<Group>) => dispatch({ type: 'group/upsert', group: { ...group, ...patch } });
  const groupExpenses = expenses.filter((e) => e.groupId === group.id);
  const trash = groupExpenses.filter((e) => e.deletedAt);
  const hasExpenses = groupExpenses.some((e) => !e.deletedAt);

  const used = (id: ID) =>
    groupExpenses.some((e) => e.payers.some((p) => p.memberId === id) || e.split.participants.includes(id) || e.split.items?.some((i) => i.memberIds.includes(id)));

  const addMember = () => {
    const names = newName.split(',').map((s) => s.trim()).filter(Boolean);
    if (!names.length) return;
    save({ members: [...group.members, ...names.map((name) => ({ id: newId(), name }))] });
    setNewName('');
  };

  const updateMember = (id: ID, patch: Partial<Member>) => save({ members: group.members.map((m) => (m.id === id ? { ...m, ...patch } : m)) });

  const share = async () => {
    const code = await encodeGroup(group, expenses);
    const url = `${location.origin}${location.pathname}#share=${code}`;
    if (navigator.share) {
      try {
        await navigator.share({ title: group.name, url });
        return;
      } catch {
        /* fall through */
      }
    }
    await navigator.clipboard?.writeText(url);
    toast('Share link copied. Opening it merges the group on the other device.');
  };

  return (
    <section className="stack">
      <div className="card form">
        <h3>Group</h3>
        <div className="row">
          <label className="field" style={{ width: 80 }}>
            <span>Icon</span>
            <input value={group.emoji} maxLength={4} onChange={(e) => save({ emoji: e.target.value })} />
          </label>
          <label className="field grow">
            <span>Name</span>
            <input value={group.name} onChange={(e) => save({ name: e.target.value })} />
          </label>
        </div>
        <div className="row">
          <label className="field grow">
            <span>Monthly budget ({group.baseCurrency})</span>
            <MoneyInput value={group.monthlyBudget ?? null} onChange={(v) => save({ monthlyBudget: v && v > 0 ? v : undefined })} currency={group.baseCurrency} placeholder="No budget" />
          </label>
          <label className="field grow">
            <span>Main currency</span>
            <input value={group.baseCurrency} disabled title="Fixed once expenses exist so past balances never change" />
          </label>
        </div>
        {hasExpenses && <p className="muted small">The main currency is locked once expenses exist so old balances never change. Expenses in other currencies keep their own rate.</p>}
      </div>

      <div className="card form">
        <h3>People</h3>
        <label className="field">
          <span>Which one is you on this device?</span>
          <select value={group.meId ?? ''} onChange={(e) => save({ meId: e.target.value || undefined })}>
            <option value="">Not set</option>
            {group.members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <ul className="members">
          {group.members.map((m) => {
            const bal = balances[m.id] ?? 0;
            const removable = !used(m.id);
            return (
              <li key={m.id}>
                <Avatar member={m} />
                <input value={m.name} aria-label="Name" onChange={(e) => updateMember(m.id, { name: e.target.value })} />
                <input value={m.upi ?? ''} aria-label="UPI ID" placeholder="UPI ID (optional)" onChange={(e) => updateMember(m.id, { upi: e.target.value.trim() || undefined })} />
                <button
                  className="icon-btn"
                  aria-label={`Remove ${m.name}`}
                  title={removable ? 'Remove' : bal !== 0 ? 'Settle their balance first' : 'Appears in expenses — kept for history'}
                  disabled={!removable}
                  onClick={() => save({ members: group.members.filter((x) => x.id !== m.id), meId: group.meId === m.id ? undefined : group.meId })}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
        <div className="row">
          <input className="grow" value={newName} placeholder="Add people (comma-separated)" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && addMember()} aria-label="New member names" />
          <button className="btn" onClick={addMember}>
            Add
          </button>
        </div>
        <p className="muted small">Nobody needs an account or an email. People can be added any time — they only share in expenses you include them in.</p>
      </div>

      <div className="card">
        <h3>Share & export</h3>
        <p className="muted small">Your data never leaves this device unless you share it. A share link contains the whole group inside the link itself.</p>
        <div className="row-actions">
          <button className="btn" onClick={share}>
            🔗 Share / sync link
          </button>
          <button className="btn" onClick={() => download(`${group.name}.csv`, groupToCSV(group, expenses), 'text/csv')}>
            ⬇ Export CSV
          </button>
          <button className="btn" onClick={() => window.print()}>
            🖨 Print / PDF
          </button>
        </div>
      </div>

      <div className="card">
        <h3>Recently deleted ({trash.length})</h3>
        {trash.length === 0 ? (
          <p className="muted small">Deleted expenses stay here so nothing is ever lost by accident.</p>
        ) : (
          <ul className="trash">
            {trash.map((e) => (
              <li key={e.id}>
                <span className="grow">
                  {e.description} · {formatMoney(e.amount, e.currency)} <small className="muted">{e.date}</small>
                </span>
                <button className="btn small" onClick={() => dispatch({ type: 'expense/restore', id: e.id })}>
                  Restore
                </button>
                <button className="btn small danger" onClick={() => dispatch({ type: 'expense/purge', id: e.id })}>
                  Delete forever
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card danger-zone">
        <h3>Danger zone</h3>
        <div className="row-actions">
          <button className="btn" onClick={() => save({ archived: !group.archived })}>
            {group.archived ? 'Unarchive group' : 'Archive group'}
          </button>
          <button
            className="btn danger"
            onClick={() => {
              const typed = prompt(`This permanently deletes “${group.name}” and all its expenses. Type the group name to confirm.`);
              if (typed?.trim() === group.name.trim()) {
                dispatch({ type: 'group/delete', id: group.id });
                onDeleted();
              }
            }}
          >
            Delete group
          </button>
        </div>
      </div>
    </section>
  );
}

