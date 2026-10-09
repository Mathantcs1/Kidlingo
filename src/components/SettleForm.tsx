import { useState } from 'react';
import { formatMoney, toDecimalString } from '../core/money';
import { todayISO } from '../core/recurring';
import type { Expense, Group, ID, Minor } from '../core/types';
import { newId, useDispatch } from '../state/store';
import { Avatar, Modal, MoneyInput, useToast } from './ui';

/** Record a payment between two members (full or partial). Stored as a ledger entry so balances stay auditable. */
export function SettleForm({ group, from, to, amount, onClose }: { group: Group; from?: ID; to?: ID; amount?: Minor; onClose: () => void }) {
  const dispatch = useDispatch();
  const toast = useToast();
  const ids = group.members.map((m) => m.id);
  const [payer, setPayer] = useState<ID>(from ?? group.meId ?? ids[0]);
  const [payee, setPayee] = useState<ID>(to ?? ids.find((id) => id !== (from ?? group.meId ?? ids[0])) ?? ids[0]);
  const [value, setValue] = useState<Minor | null>(amount ?? null);
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState('');
  const cur = group.baseCurrency;
  const m = (id: ID) => group.members.find((x) => x.id === id);

  const error = payer === payee ? 'Choose two different people' : !value || value <= 0 ? 'Enter an amount' : null;

  const save = () => {
    if (error || !value) return;
    const now = Date.now();
    const e: Expense = {
      id: newId(),
      groupId: group.id,
      kind: 'payment',
      description: `${m(payer)?.name} paid ${m(payee)?.name}`,
      category: 'general',
      currency: cur,
      amount: value,
      fxRate: 1,
      date,
      payers: [{ memberId: payer, amount: value }],
      split: { mode: 'exact', participants: [payee], values: { [payee]: value } },
      notes: note.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };
    dispatch({ type: 'expense/upsert', expense: e });
    toast(`Recorded ${formatMoney(value, cur)} payment`, { label: 'Undo', run: () => dispatch({ type: 'expense/purge', id: e.id }) });
    onClose();
  };

  const upi = m(payee)?.upi;
  const upiLink =
    upi && value && cur === 'INR'
      ? `upi://pay?pa=${encodeURIComponent(upi)}&pn=${encodeURIComponent(m(payee)?.name ?? '')}&am=${toDecimalString(value, cur)}&cu=INR&tn=${encodeURIComponent(group.name)}`
      : null;

  const picker = (label: string, v: ID, onPick: (id: ID) => void) => (
    <label className="field grow">
      <span>{label}</span>
      <select value={v} onChange={(e) => onPick(e.target.value)}>
        {group.members.map((x) => (
          <option key={x.id} value={x.id}>
            {x.id === group.meId ? `${x.name} (you)` : x.name}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <Modal
      title="Record a payment"
      onClose={onClose}
      footer={
        <>
          <span className="form-error">{value ? error : ''}</span>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!!error} onClick={save}>
            Save payment
          </button>
        </>
      }
    >
      <div className="form">
        <div className="settle-visual">
          <Avatar member={m(payer)} size={44} />
          <span className="arrow">→</span>
          <Avatar member={m(payee)} size={44} />
        </div>
        <div className="row">
          {picker('From', payer, setPayer)}
          {picker('To', payee, setPayee)}
        </div>
        <div className="row">
          <label className="field grow">
            <span>Amount ({cur})</span>
            <MoneyInput value={value} onChange={setValue} currency={cur} className="big" />
          </label>
          <label className="field">
            <span>Date</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
        {amount && value !== amount ? <p className="muted small">Partial payments are fine — the rest stays outstanding.</p> : null}
        <label className="field">
          <span>Note (optional)</span>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. GPay, cash" />
        </label>
        {upiLink && (
          <a className="btn" href={upiLink}>
            Open UPI app to pay {formatMoney(value!, cur)}
          </a>
        )}
      </div>
    </Modal>
  );
}
