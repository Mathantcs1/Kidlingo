import { useMemo, useState } from 'react';
import { convert, COMMON_CURRENCIES, formatMoney } from '../core/money';
import { addPeriod, todayISO } from '../core/recurring';
import { computeShares, SplitError, validatePayers } from '../core/split';
import type { Expense, Frequency, Group, ID, Minor, SplitItem, SplitMode } from '../core/types';
import { CATEGORIES } from '../core/types';
import { newId, useAppState, useDispatch } from '../state/store';
import { Avatar, Modal, MoneyInput, useToast } from './ui';

const MODES: { id: SplitMode; label: string; hint: string }[] = [
  { id: 'equal', label: 'Equally', hint: 'Split evenly between the selected people' },
  { id: 'exact', label: 'Amounts', hint: 'Enter exactly how much each person owes' },
  { id: 'percent', label: '%', hint: 'Split by percentage' },
  { id: 'shares', label: 'Shares', hint: 'Split by shares, e.g. 2 for a couple, 1 for a single' },
  { id: 'adjust', label: '+/−', hint: 'Equal split plus individual extras (e.g. someone had dessert)' },
  { id: 'itemized', label: 'Items', hint: 'Assign bill items to people; tax & tip are shared proportionally' },
];

const KEYWORDS: [RegExp, string][] = [
  [/uber|ola|taxi|cab|metro|bus|train|fuel|petrol|diesel|parking|toll|flight|rapido/i, 'transport'],
  [/hotel|airbnb|hostel|stay|resort|booking/i, 'travel'],
  [/dinner|lunch|breakfast|cafe|coffee|restaurant|pizza|food|swiggy|zomato|drinks|bar|beer/i, 'food'],
  [/grocer|supermarket|bigbasket|blinkit|zepto|dmart|vegetable|milk/i, 'groceries'],
  [/rent|lease|deposit/i, 'rent'],
  [/electric|power|water|gas|wifi|internet|broadband|phone|recharge|bill/i, 'utilities'],
  [/movie|netflix|spotify|concert|game|tickets|party/i, 'entertainment'],
  [/amazon|flipkart|shopping|clothes|mall/i, 'shopping'],
  [/doctor|pharma|medicine|hospital|clinic/i, 'health'],
  [/gift|birthday|wedding/i, 'gifts'],
];
const guessCategory = (desc: string) => KEYWORDS.find(([re]) => re.test(desc))?.[1];

export function ExpenseForm({ group, expense, onClose }: { group: Group; expense?: Expense; onClose: () => void }) {
  const dispatch = useDispatch();
  const toast = useToast();
  // A duplicated expense arrives pre-filled but isn't stored yet.
  const isEdit = useAppState().expenses.some((e) => e.id === expense?.id);
  const members = group.members;
  const allIds = members.map((m) => m.id);
  const defaultPayer = group.meId ?? allIds[0];

  const [description, setDescription] = useState(expense?.description ?? '');
  const [amount, setAmount] = useState<Minor | null>(expense?.amount ?? null);
  const [currency, setCurrency] = useState(expense?.currency ?? group.baseCurrency);
  const [fxRate, setFxRate] = useState(String(expense?.fxRate ?? 1));
  const [date, setDate] = useState(expense?.date ?? todayISO());
  const [category, setCategory] = useState(expense?.category ?? 'general');
  const [categoryTouched, setCategoryTouched] = useState(!!expense);
  const [notes, setNotes] = useState(expense?.notes ?? '');
  const [recurring, setRecurring] = useState<Frequency | ''>(expense?.recurring?.freq ?? '');

  const initialMulti = (expense?.payers.filter((p) => p.amount > 0).length ?? 0) > 1;
  const [multiPay, setMultiPay] = useState(initialMulti);
  const [payerId, setPayerId] = useState<ID>(expense?.payers[0]?.memberId ?? defaultPayer);
  const [payAmounts, setPayAmounts] = useState<Record<ID, Minor | null>>(
    Object.fromEntries((expense?.payers ?? []).map((p) => [p.memberId, p.amount])),
  );

  const [mode, setMode] = useState<SplitMode>(expense?.split.mode ?? 'equal');
  const [participants, setParticipants] = useState<ID[]>(
    expense && expense.split.mode !== 'itemized' ? expense.split.participants : allIds,
  );
  const [values, setValues] = useState<Record<ID, number>>(expense?.split.values ?? {});
  const [items, setItems] = useState<SplitItem[]>(expense?.split.items ?? [{ id: newId(), name: '', amount: 0, memberIds: allIds }]);
  const [showMore, setShowMore] = useState(!!(expense?.notes || expense?.recurring || (expense && expense.currency !== group.baseCurrency)));

  const rate = Number(fxRate);
  const payers = multiPay
    ? Object.entries(payAmounts).filter(([, a]) => (a ?? 0) > 0).map(([memberId, a]) => ({ memberId, amount: a! }))
    : amount
      ? [{ memberId: payerId, amount }]
      : [];
  const split = { mode, participants: mode === 'itemized' ? [] : participants, values: mode === 'equal' ? undefined : values, items: mode === 'itemized' ? items : undefined };

  const { shares, error } = useMemo(() => {
    if (!description.trim()) return { shares: null, error: 'Add a description' };
    if (!amount || amount <= 0) return { shares: null, error: 'Enter an amount' };
    if (currency !== group.baseCurrency && !(rate > 0)) return { shares: null, error: 'Enter a valid exchange rate' };
    const payErr = validatePayers(amount, payers);
    try {
      const s = computeShares(amount, split, expense?.id ?? 'preview');
      return { shares: s, error: payErr };
    } catch (e) {
      return { shares: null, error: e instanceof SplitError ? e.message : String(e) };
    }
  }, [description, amount, currency, rate, JSON.stringify(payers), JSON.stringify(split)]);

  const save = () => {
    if (error || !amount) return;
    const now = Date.now();
    const e: Expense = {
      id: expense?.id ?? newId(),
      groupId: group.id,
      kind: 'expense',
      description: description.trim(),
      category,
      currency,
      amount,
      fxRate: currency === group.baseCurrency ? 1 : rate,
      date,
      payers,
      split,
      notes: notes.trim() || undefined,
      recurring: recurring ? { freq: recurring, nextDate: expense?.recurring?.freq === recurring ? expense.recurring.nextDate : addPeriod(date, recurring) } : undefined,
      recurringSourceId: expense?.recurringSourceId,
      createdAt: expense?.createdAt ?? now,
      updatedAt: now,
    };
    dispatch({ type: 'expense/upsert', expense: e });
    if (e.recurring) dispatch({ type: 'recurring/run', today: todayISO() });
    if (currency !== group.baseCurrency && group.rates[currency] !== rate) {
      dispatch({ type: 'group/upsert', group: { ...group, rates: { ...group.rates, [currency]: rate } } });
    }
    toast(isEdit ? 'Expense updated' : 'Expense added');
    onClose();
  };

  const toggle = (id: ID) => setParticipants((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const nameOf = (id: ID) => members.find((m) => m.id === id)?.name ?? 'Unknown';
  const sumValues = participants.reduce((s, id) => s + (values[id] ?? 0), 0);
  const itemsTotal = items.reduce((s, it) => s + (it.amount || 0), 0);

  return (
    <Modal
      title={isEdit ? 'Edit expense' : 'Add expense'}
      onClose={onClose}
      footer={
        <>
          <span className="form-error" role="alert">
            {description || amount ? error : ''}
          </span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!!error} onClick={save}>
            Save
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
        <div className="row">
          <label className="field grow">
            <span>Description</span>
            <input
              value={description}
              placeholder="e.g. Dinner at Toit"
              onChange={(e) => {
                setDescription(e.target.value);
                const g = guessCategory(e.target.value);
                if (!categoryTouched && g) setCategory(g);
              }}
            />
          </label>
          <label className="field">
            <span>Category</span>
            <select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                setCategoryTouched(true);
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.icon} {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row">
          <label className="field grow">
            <span>Amount</span>
            <MoneyInput value={amount} onChange={setAmount} currency={currency} placeholder="0.00 — try 1200/3+50" className="big" />
          </label>
          <label className="field">
            <span>Currency</span>
            <select
              value={currency}
              onChange={(e) => {
                const c = e.target.value;
                setCurrency(c);
                setFxRate(String(c === group.baseCurrency ? 1 : group.rates[c] ?? ''));
                if (c !== group.baseCurrency) setShowMore(true);
              }}
            >
              {[...new Set([group.baseCurrency, ...COMMON_CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>

        {currency !== group.baseCurrency && (
          <div className="row fx">
            <label className="field">
              <span>
                1 {currency} = ? {group.baseCurrency}
              </span>
              <input inputMode="decimal" value={fxRate} onChange={(e) => setFxRate(e.target.value)} placeholder="Exchange rate" />
            </label>
            {amount && rate > 0 ? (
              <p className="muted small">
                ≈ {formatMoney(convert(amount, currency, group.baseCurrency, rate), group.baseCurrency)} — rate is saved with this expense, so
                balances never shift when rates change later.
              </p>
            ) : null}
          </div>
        )}

        <fieldset className="section">
          <legend>
            Paid by{' '}
            <button type="button" className="link-btn" onClick={() => setMultiPay((m) => !m)}>
              {multiPay ? 'single payer' : 'multiple people'}
            </button>
          </legend>
          {!multiPay ? (
            <div className="chips">
              {members.map((m) => (
                <button type="button" key={m.id} className={`chip ${payerId === m.id ? 'on' : ''}`} onClick={() => setPayerId(m.id)}>
                  <Avatar member={m} size={20} /> {m.id === group.meId ? 'You' : m.name}
                </button>
              ))}
            </div>
          ) : (
            <div className="grid-list">
              {members.map((m) => (
                <label key={m.id} className="split-row">
                  <Avatar member={m} size={24} />
                  <span className="grow">{m.name}</span>
                  <MoneyInput value={payAmounts[m.id] ?? null} onChange={(v) => setPayAmounts((p) => ({ ...p, [m.id]: v }))} currency={currency} ariaLabel={`${m.name} paid`} />
                </label>
              ))}
              {amount ? <Remaining label="Left to assign" total={amount} used={payers.reduce((s, p) => s + p.amount, 0)} currency={currency} /> : null}
            </div>
          )}
        </fieldset>

        <fieldset className="section">
          <legend>Split</legend>
          <div className="seg" role="tablist">
            {MODES.map((m) => (
              <button type="button" role="tab" aria-selected={mode === m.id} key={m.id} className={mode === m.id ? 'on' : ''} title={m.hint} onClick={() => setMode(m.id)}>
                {m.label}
              </button>
            ))}
          </div>
          <p className="muted small">{MODES.find((m) => m.id === mode)!.hint}</p>

          {mode !== 'itemized' ? (
            <div className="grid-list">
              {members.map((m) => {
                const on = participants.includes(m.id);
                return (
                  <div key={m.id} className={`split-row ${on ? '' : 'off'}`}>
                    <input type="checkbox" checked={on} onChange={() => toggle(m.id)} aria-label={`Include ${m.name}`} />
                    <Avatar member={m} size={24} />
                    <span className="grow">{m.name}</span>
                    {on && (mode === 'exact' || mode === 'adjust') && (
                      <MoneyInput
                        value={values[m.id] ?? null}
                        onChange={(v) => setValues((x) => ({ ...x, [m.id]: v ?? 0 }))}
                        currency={currency}
                        placeholder={mode === 'adjust' ? '+0' : '0.00'}
                        ariaLabel={`${m.name} amount`}
                      />
                    )}
                    {on && (mode === 'percent' || mode === 'shares') && (
                      <input
                        className="num"
                        inputMode="decimal"
                        aria-label={`${m.name} ${mode}`}
                        value={values[m.id] ?? ''}
                        placeholder={mode === 'percent' ? '%' : '1'}
                        onChange={(e) => setValues((x) => ({ ...x, [m.id]: Number(e.target.value) || 0 }))}
                      />
                    )}
                    <span className="share">{on && shares ? formatMoney(shares[m.id] ?? 0, currency) : '—'}</span>
                  </div>
                );
              })}
              <div className="split-tools">
                <button type="button" className="link-btn" onClick={() => setParticipants(allIds)}>
                  Everyone
                </button>
                <button type="button" className="link-btn" onClick={() => setParticipants([])}>
                  No one
                </button>
                {mode === 'percent' && (
                  <>
                    <button type="button" className="link-btn" onClick={() => setValues(Object.fromEntries(participants.map((id) => [id, Math.round((100 / participants.length) * 1e4) / 1e4])))}>
                      Even %
                    </button>
                    <span className={`muted small ${Math.abs(sumValues - 100) < 1e-6 ? '' : 'warn'}`}>Total {Math.round(sumValues * 100) / 100}%</span>
                  </>
                )}
                {mode === 'exact' && amount ? <Remaining label="Left" total={amount} used={sumValues} currency={currency} /> : null}
                {mode === 'exact' && amount && participants.length > 0 ? (
                  <button
                    type="button"
                    className="link-btn"
                    title="Give the remaining amount to the last person without a value"
                    onClick={() => {
                      const empty = participants.filter((id) => !values[id]);
                      const target = empty[empty.length - 1] ?? participants[participants.length - 1];
                      setValues((x) => ({ ...x, [target]: (x[target] ?? 0) + amount - sumValues }));
                    }}
                  >
                    Fill remainder
                  </button>
                ) : null}
              </div>
            </div>
          ) : (
            <div className="items">
              {items.map((it, idx) => (
                <div key={it.id} className="item">
                  <div className="row">
                    <input
                      className="grow"
                      placeholder={`Item ${idx + 1}`}
                      value={it.name}
                      aria-label="Item name"
                      onChange={(e) => setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, name: e.target.value } : x)))}
                    />
                    <MoneyInput value={it.amount || null} onChange={(v) => setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, amount: v ?? 0 } : x)))} currency={currency} ariaLabel="Item price" />
                    <button type="button" className="icon-btn" aria-label="Remove item" onClick={() => setItems((xs) => xs.filter((x) => x.id !== it.id))}>
                      ✕
                    </button>
                  </div>
                  <div className="chips small">
                    {members.map((m) => (
                      <button
                        type="button"
                        key={m.id}
                        className={`chip ${it.memberIds.includes(m.id) ? 'on' : ''}`}
                        onClick={() =>
                          setItems((xs) =>
                            xs.map((x) =>
                              x.id === it.id ? { ...x, memberIds: x.memberIds.includes(m.id) ? x.memberIds.filter((y) => y !== m.id) : [...x.memberIds, m.id] } : x,
                            ),
                          )
                        }
                      >
                        {m.name}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <button type="button" className="btn small" onClick={() => setItems((xs) => [...xs, { id: newId(), name: '', amount: 0, memberIds: allIds }])}>
                + Add item
              </button>
              {amount ? (
                <p className="muted small">
                  Items {formatMoney(itemsTotal, currency)} · {amount - itemsTotal >= 0 ? 'Tax/tip/service' : 'Discount'}{' '}
                  {formatMoney(Math.abs(amount - itemsTotal), currency)} shared proportionally
                </p>
              ) : null}
              {shares && (
                <div className="chips small">
                  {Object.entries(shares).map(([id, s]) => (
                    <span key={id} className="chip on static">
                      {nameOf(id)}: {formatMoney(s, currency)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
        </fieldset>

        <button type="button" className="link-btn" onClick={() => setShowMore((s) => !s)}>
          {showMore ? '− Fewer options' : '+ Notes, repeat'}
        </button>
        {showMore && (
          <div className="row">
            <label className="field grow">
              <span>Notes</span>
              <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Anything worth remembering" />
            </label>
            <label className="field">
              <span>Repeat</span>
              <select value={recurring} onChange={(e) => setRecurring(e.target.value as Frequency | '')}>
                <option value="">Never</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </label>
          </div>
        )}
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

function Remaining({ label, total, used, currency }: { label: string; total: Minor; used: Minor; currency: string }) {
  const left = total - used;
  return (
    <span className={`muted small ${left === 0 ? '' : 'warn'}`}>
      {label}: {formatMoney(left, currency)}
    </span>
  );
}
