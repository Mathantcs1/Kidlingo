import { useMemo, useRef, useState } from 'react';
import { groupBalances } from '../core/balances';
import { defaultState, download, parseState } from '../core/io';
import { COMMON_CURRENCIES, formatMoney } from '../core/money';
import type { Group, ID } from '../core/types';
import { newId, useAppState, useDispatch } from '../state/store';
import { Avatar, Empty, Modal, useToast } from './ui';

const EMOJIS = ['🏖️', '🏠', '🍕', '✈️', '🎉', '💼', '🚗', '🏕️', '💑', '👨‍👩‍👧', '🎓', '⚽'];

export function Home({ onOpen }: { onOpen: (id: ID) => void }) {
  const { groups, expenses } = useAppState();
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  const summaries = useMemo(
    () =>
      groups.map((g) => {
        const b = groupBalances(g, expenses);
        const count = expenses.filter((e) => e.groupId === g.id && !e.deletedAt).length;
        return { g, me: g.meId ? b[g.meId] ?? 0 : null, open: Object.values(b).some((v) => v !== 0), count };
      }),
    [groups, expenses],
  );

  // "Across all groups" totals, per currency (we never silently mix currencies).
  const totals = new Map<string, { owed: number; owe: number }>();
  for (const s of summaries) {
    if (s.me === null || s.g.archived) continue;
    const t = totals.get(s.g.baseCurrency) ?? { owed: 0, owe: 0 };
    if (s.me > 0) t.owed += s.me;
    else t.owe -= s.me;
    totals.set(s.g.baseCurrency, t);
  }

  const visible = summaries.filter((s) => !!s.g.archived === showArchived).sort((a, b) => b.g.createdAt - a.g.createdAt);
  const archivedCount = summaries.filter((s) => s.g.archived).length;

  return (
    <div>
      {totals.size > 0 && (
        <div className="kpis">
          {[...totals].map(([cur, t]) => (
            <div className="kpi" key={cur}>
              <small>Across groups ({cur})</small>
              <strong>
                <span className="pos">{formatMoney(t.owed, cur)}</span> owed to you
              </strong>
              <strong>
                <span className="neg">{formatMoney(t.owe, cur)}</span> you owe
              </strong>
            </div>
          ))}
        </div>
      )}

      <div className="section-head">
        <h2>{showArchived ? 'Archived groups' : 'Groups'}</h2>
        <button className="btn primary" onClick={() => setCreating(true)}>
          + New group
        </button>
      </div>

      {groups.length === 0 ? (
        <Empty icon="👋" title="Split anything with anyone">
          <p className="muted">Trips, flatmates, dinners, couples. Unlimited expenses, no ads, no sign-up — and it works offline.</p>
          <button className="btn primary" onClick={() => setCreating(true)}>
            Create your first group
          </button>
        </Empty>
      ) : (
        <ul className="group-list">
          {visible.map(({ g, me, open, count }) => (
            <li key={g.id}>
              <button className="group-card" onClick={() => onOpen(g.id)}>
                <span className="group-emoji">{g.emoji}</span>
                <span className="grow">
                  <strong>{g.name}</strong>
                  <span className="avatars">
                    {g.members.slice(0, 6).map((m) => (
                      <Avatar key={m.id} member={m} size={20} />
                    ))}
                    {g.members.length > 6 && <small className="muted"> +{g.members.length - 6}</small>}
                    <small className="muted"> · {count} expenses</small>
                  </span>
                </span>
                <span className="group-bal">
                  {me === null ? (
                    <small className="muted">{open ? 'balances open' : 'settled up'}</small>
                  ) : me === 0 ? (
                    <small className="muted">settled up</small>
                  ) : (
                    <>
                      <small className="muted">{me > 0 ? 'you are owed' : 'you owe'}</small>
                      <span className={me > 0 ? 'pos' : 'neg'}>{formatMoney(Math.abs(me), g.baseCurrency)}</span>
                    </>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {(archivedCount > 0 || showArchived) && (
        <button className="link-btn center-block" onClick={() => setShowArchived((s) => !s)}>
          {showArchived ? '← Back to active groups' : `Show archived (${archivedCount})`}
        </button>
      )}

      {creating && (
        <NewGroup
          onClose={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onOpen(id);
          }}
        />
      )}
    </div>
  );
}

function NewGroup({ onClose, onCreated }: { onClose: () => void; onCreated: (id: ID) => void }) {
  const { settings } = useAppState();
  const dispatch = useDispatch();
  const [name, setName] = useState('');
  const [emoji, setEmoji] = useState(EMOJIS[0]);
  const [currency, setCurrency] = useState(settings.defaultCurrency);
  const [me, setMe] = useState('');
  const [others, setOthers] = useState('');

  const people = [me, ...others.split(/[,\n]/)].map((s) => s.trim()).filter(Boolean);
  const valid = name.trim() && people.length > 0;

  const create = () => {
    if (!valid) return;
    const members = people.map((n) => ({ id: newId(), name: n }));
    const g: Group = {
      id: newId(),
      name: name.trim(),
      emoji,
      baseCurrency: currency,
      members,
      meId: me.trim() ? members[0].id : undefined,
      rates: {},
      simplifyDebts: true,
      createdAt: Date.now(),
    };
    dispatch({ type: 'group/upsert', group: g });
    if (currency !== settings.defaultCurrency) dispatch({ type: 'settings', patch: { defaultCurrency: currency } });
    onCreated(g.id);
  };

  return (
    <Modal
      title="New group"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!valid} onClick={create}>
            Create group
          </button>
        </>
      }
    >
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <label className="field">
          <span>Group name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Goa trip, Flat 4B, Date nights…" />
        </label>
        <div className="chips">
          {EMOJIS.map((e) => (
            <button type="button" key={e} className={`chip emoji ${emoji === e ? 'on' : ''}`} onClick={() => setEmoji(e)} aria-label={`Icon ${e}`}>
              {e}
            </button>
          ))}
        </div>
        <div className="row">
          <label className="field grow">
            <span>Your name</span>
            <input value={me} onChange={(e) => setMe(e.target.value)} placeholder="You" />
          </label>
          <label className="field">
            <span>Currency</span>
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              {[...new Set([settings.defaultCurrency, ...COMMON_CURRENCIES])].map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          <span>Who else? (comma or one per line)</span>
          <textarea rows={3} value={others} onChange={(e) => setOthers(e.target.value)} placeholder="Priya, Rahul, Sam" />
        </label>
        <p className="muted small">No emails, phone numbers or accounts needed. You can add more people later.</p>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function AppSettings({ onClose }: { onClose: () => void }) {
  const state = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const { settings } = state;

  const restore = async (file: File) => {
    try {
      const next = parseState(JSON.parse(await file.text()));
      if (!confirm(`Replace everything on this device with the backup (${next.groups.length} groups, ${next.expenses.length} expenses)?`)) return;
      dispatch({ type: 'replace', state: next });
      toast('Backup restored');
      onClose();
    } catch (e) {
      alert(`Could not restore: ${e instanceof Error ? e.message : e}`);
    }
  };

  return (
    <Modal title="Settings" onClose={onClose}>
      <div className="form">
        <label className="field">
          <span>Theme</span>
          <select value={settings.theme} onChange={(e) => dispatch({ type: 'settings', patch: { theme: e.target.value as typeof settings.theme } })}>
            <option value="system">Match system</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </label>
        <label className="field">
          <span>Default currency for new groups</span>
          <select value={settings.defaultCurrency} onChange={(e) => dispatch({ type: 'settings', patch: { defaultCurrency: e.target.value } })}>
            {COMMON_CURRENCIES.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
        </label>

        <fieldset className="section">
          <legend>Backup</legend>
          <p className="muted small">Everything is stored only on this device. Download a backup now and then, or to move to a new phone.</p>
          <div className="row-actions">
            <button className="btn" onClick={() => download(`fairshare-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(state, null, 2), 'application/json')}>
              ⬇ Download backup
            </button>
            <button className="btn" onClick={() => fileRef.current?.click()}>
              ⬆ Restore backup
            </button>
            <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && restore(e.target.files[0])} />
          </div>
        </fieldset>

        <fieldset className="section">
          <legend>Danger zone</legend>
          <button
            className="btn danger"
            onClick={() => {
              if (confirm('Erase all groups and expenses on this device? Download a backup first if unsure.')) {
                dispatch({ type: 'replace', state: { ...defaultState(), settings } });
                onClose();
              }
            }}
          >
            Erase all data
          </button>
        </fieldset>
        <p className="muted small center">Fairshare · free forever · no ads · no tracking · works offline</p>
      </div>
    </Modal>
  );
}
