import { useEffect, useState } from 'react';
import { getCapabilities, importBlockers, missingCapabilities } from './media/support';
import Banner from './ui/Banner';
import ConfirmDialog, { useConfirm } from './ui/Confirm';
import MediaBin from './ui/MediaBin';
import ExportDialog from './ui/ExportDialog';
import { useExportUi } from './ui/exportJob';
import Inspector from './ui/Inspector';
import Preview from './ui/Preview';
import { startSessionOnce } from './ui/session';
import type { SessionState } from './ui/session';
import Timeline from './ui/Timeline';
import Toasts from './ui/Toast';
import Toolbar from './ui/Toolbar';
import TopBar from './ui/TopBar';
import { usePlayback } from './ui/usePlayback';
import { useShortcuts } from './ui/useShortcuts';

const capabilities = getCapabilities();
const missing = missingCapabilities(capabilities);
const canImport = importBlockers(capabilities).length === 0;

export default function App() {
  const [session, setSession] = useState<SessionState>('loading');
  const ready = session === 'ready';
  const dialogOpen = useExportUi((s) => s.open !== null);
  const confirmOpen = useConfirm((s) => s.request !== null);
  const modal = dialogOpen || confirmOpen;
  const locked = session === 'locked';
  // Editing stays inert until the saved session is restored (a restore never discards new edits), forever in a tab
  // that does not own the editor (another tab has it open), and while a modal is open (the editor is `inert`).
  useShortcuts(ready && !modal);
  usePlayback();
  useEffect(() => {
    let live = true;
    void startSessionOnce().then((s) => {
      if (live) setSession(s);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <div className="app" data-testid="app" data-session={session} inert={modal}>
        <Banner missing={missing} />
        {locked && (
          <div className="banner banner-locked" role="alert" data-testid="session-locked">
            ClipForge is already open in another tab. Close this tab or use that one.
          </div>
        )}
        <TopBar editable={ready} inert={locked} />
        <main className="workspace" inert={locked}>
          <MediaBin supported={canImport} ready={ready} />
          <Preview />
          <Inspector editable={ready} />
        </main>
        <Toolbar editable={ready} inert={locked} />
        <Timeline inert={locked} />
      </div>
      {dialogOpen && <ExportDialog />}
      {confirmOpen && <ConfirmDialog />}
      <Toasts />
    </>
  );
}
