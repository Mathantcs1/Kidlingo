import { useEffect, useState } from 'react';
import { decodeGroup } from './core/io';
import type { Expense, Group, ID } from './core/types';
import { GroupView } from './components/GroupView';
import { AppSettings, Home } from './components/Home';
import { Modal, useToast } from './components/ui';
import { useAppState, useDispatch } from './state/store';

/** Hash routing: "#/g/<id>" opens a group; "#share=<code>" imports a shared group. */
function useRoute(): [ID | null, (id: ID | null) => void] {
  const read = () => /^#\/g\/(.+)$/.exec(location.hash)?.[1] ?? null;
  const [id, setId] = useState(read);
  useEffect(() => {
    const on = () => setId(read());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return [id, (next) => (location.hash = next ? `#/g/${next}` : '#/')];
}

export function App() {
  const { groups, settings } = useAppState();
  const dispatch = useDispatch();
  const toast = useToast();
  const [groupId, go] = useRoute();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [incoming, setIncoming] = useState<{ group: Group; expenses: Expense[] } | null>(null);
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const root = document.documentElement;
    if (settings.theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', settings.theme);
  }, [settings.theme]);

  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', on);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', on);
    };
  }, []);

  useEffect(() => {
    const m = /^#share=(.+)$/.exec(location.hash);
    if (!m) return;
    history.replaceState(null, '', location.pathname);
    decodeGroup(m[1])
      .then(setIncoming)
      .catch(() => toast('That share link is invalid or incomplete'));
  }, [toast]);

  const group = groups.find((g) => g.id === groupId);

  return (
    <div className="app">
      <header className="topbar">
        <button className="brand" onClick={() => go(null)}>
          <img src="./icon.svg" alt="" width={26} height={26} />
          Fairshare
        </button>
        {!online && <span className="pill">Offline — everything still works</span>}
        <button className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label="Settings">
          ⚙
        </button>
      </header>
      <main>{group ? <GroupView key={group.id} group={group} onBack={() => go(null)} /> : <Home onOpen={go} />}</main>

      {settingsOpen && <AppSettings onClose={() => setSettingsOpen(false)} />}
      {incoming && (
        <Modal
          title="Import shared group"
          onClose={() => setIncoming(null)}
          footer={
            <>
              <button className="btn" onClick={() => setIncoming(null)}>
                Cancel
              </button>
              <button
                className="btn primary"
                onClick={() => {
                  dispatch({ type: 'group/merge', group: incoming.group, expenses: incoming.expenses });
                  setIncoming(null);
                  go(incoming.group.id);
                  toast('Group imported');
                }}
              >
                {groups.some((g) => g.id === incoming.group.id) ? 'Merge changes' : 'Import'}
              </button>
            </>
          }
        >
          <p>
            {incoming.group.emoji} <strong>{incoming.group.name}</strong> — {incoming.group.members.length} people, {incoming.expenses.length} expenses.
          </p>
          {groups.some((g) => g.id === incoming.group.id) ? (
            <p className="muted small">You already have this group. Changes will be merged — the most recent edit of each expense wins, and nothing you added is lost.</p>
          ) : (
            <p className="muted small">It will be saved on this device. Afterwards, pick which member you are in the group’s Settings.</p>
          )}
        </Modal>
      )}
    </div>
  );
}
