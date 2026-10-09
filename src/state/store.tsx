import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import { loadState, saveState, STORAGE_KEY, parseState } from '../core/io';
import { materializeRecurring, todayISO } from '../core/recurring';
import type { AppState, Expense, Group, ID, Settings } from '../core/types';

export const newId = (): string =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

export type Action =
  | { type: 'group/upsert'; group: Group }
  | { type: 'group/delete'; id: ID }
  | { type: 'group/merge'; group: Group; expenses: Expense[] }
  | { type: 'expense/upsert'; expense: Expense }
  | { type: 'expense/delete'; id: ID }
  | { type: 'expense/restore'; id: ID }
  | { type: 'expense/purge'; id: ID }
  | { type: 'recurring/run'; today: string }
  | { type: 'settings'; patch: Partial<Settings> }
  | { type: 'replace'; state: AppState };

const upsert = <T extends { id: ID }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

export function reducer(state: AppState, action: Action): AppState {
  const now = Date.now();
  switch (action.type) {
    case 'group/upsert':
      return { ...state, groups: upsert(state.groups, action.group) };
    case 'group/delete':
      return {
        ...state,
        groups: state.groups.filter((g) => g.id !== action.id),
        expenses: state.expenses.filter((e) => e.groupId !== action.id),
      };
    case 'group/merge': {
      // Last-write-wins merge by id, so two people can exchange share links and converge.
      // Deletions travel as tombstones (deletedAt), so they merge too.
      const existing = state.groups.find((g) => g.id === action.group.id);
      const members = existing
        ? [...existing.members, ...action.group.members.filter((m) => !existing.members.some((x) => x.id === m.id))]
        : action.group.members;
      // "Which member is me" is per-device, so never take it from the sender.
      const group = { ...(existing ?? action.group), ...action.group, members, meId: existing?.meId };
      const byId = new Map(state.expenses.map((e) => [e.id, e]));
      for (const e of action.expenses) {
        const cur = byId.get(e.id);
        if (!cur || e.updatedAt > cur.updatedAt) byId.set(e.id, e);
      }
      return { ...state, groups: upsert(state.groups, group), expenses: [...byId.values()] };
    }
    case 'expense/upsert':
      return { ...state, expenses: upsert(state.expenses, { ...action.expense, updatedAt: now }) };
    case 'expense/delete':
      return { ...state, expenses: state.expenses.map((e) => (e.id === action.id ? { ...e, deletedAt: now, updatedAt: now } : e)) };
    case 'expense/restore':
      return {
        ...state,
        expenses: state.expenses.map((e) => (e.id === action.id ? { ...e, deletedAt: undefined, updatedAt: now } : e)),
      };
    case 'expense/purge':
      return { ...state, expenses: state.expenses.filter((e) => e.id !== action.id) };
    case 'recurring/run': {
      const { created, updated } = materializeRecurring(state.expenses, action.today, newId, now);
      if (created.length === 0) return state;
      const upd = new Map(updated.map((e) => [e.id, e]));
      return { ...state, expenses: [...state.expenses.map((e) => upd.get(e.id) ?? e), ...created] };
    }
    case 'settings':
      return { ...state, settings: { ...state.settings, ...action.patch } };
    case 'replace':
      return action.state;
  }
}

const StateCtx = createContext<AppState | null>(null);
const DispatchCtx = createContext<Dispatch<Action> | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadState);

  useEffect(() => saveState(state), [state]);

  // Generate due recurring expenses on launch and whenever the app comes back to the foreground.
  useEffect(() => {
    const run = () => dispatch({ type: 'recurring/run', today: todayISO() });
    run();
    const onVis = () => document.visibilityState === 'visible' && run();
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Keep multiple open tabs in sync.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key !== STORAGE_KEY || !e.newValue) return;
      try {
        dispatch({ type: 'replace', state: parseState(JSON.parse(e.newValue)) });
      } catch {
        /* ignore malformed writes */
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  return (
    <StateCtx.Provider value={state}>
      <DispatchCtx.Provider value={dispatch}>{children}</DispatchCtx.Provider>
    </StateCtx.Provider>
  );
}

export function useAppState(): AppState {
  const s = useContext(StateCtx);
  if (!s) throw new Error('useAppState outside StoreProvider');
  return s;
}

export function useDispatch(): Dispatch<Action> {
  const d = useContext(DispatchCtx);
  if (!d) throw new Error('useDispatch outside StoreProvider');
  return d;
}
