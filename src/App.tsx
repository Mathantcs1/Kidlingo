import { useEffect } from 'react';
import { getCapabilities, importBlockers, missingCapabilities } from './media/support';
import Banner from './ui/Banner';
import ConfirmDialog, { useConfirm } from './ui/Confirm';
import MediaBin from './ui/MediaBin';
import ExportDialog from './ui/ExportDialog';
import { useExportUi } from './ui/exportJob';
import Inspector from './ui/Inspector';
import Preview from './ui/Preview';
import RestoreNotice from './ui/RestoreNotice';
import { startSessionOnce, useSessionState } from './ui/session';
import Timeline from './ui/Timeline';
import Toasts from './ui/Toast';
import Toolbar from './ui/Toolbar';
import TopBar from './ui/TopBar';
import { usePlayback } from './ui/usePlayback';
import { useFileDropGuard } from './ui/useFileDropGuard';
import { useShortcuts } from './ui/useShortcuts';

const capabilities = getCapabilities();
const missing = missingCapabilities(capabilities);
const canImport = importBlockers(capabilities).length === 0;

export default function App() {
  const session = useSessionState((s) => s.state);
  const ready = session === 'ready';
  const dialogOpen = useExportUi((s) => s.open !== null);
  const confirmOpen = useConfirm((s) => s.request !== null);
  const modal = dialogOpen || confirmOpen;
  const locked = session === 'locked';
  // Editing stays inert until the saved session is restored (a restore never discards new edits), forever in a tab
  // that does not own the editor (another tab has it open), and while a modal is open (the editor is `inert`).
  useShortcuts(ready && !modal);
  usePlayback();
  useFileDropGuard();
  useEffect(() => {
    void startSessionOnce();
  }, []);

  return (
    <>
      <div className="app" data-testid="app" data-session={session} inert={modal}>
        <Banner missing={missing} />
        {locked && (
          <div className="banner banner-locked" role="alert" data-testid="session-locked">
            ClipForge is already open in another tab. Use that tab, or close it and this one takes over.
          </div>
        )}
        {ready && <RestoreNotice />}
        <TopBar editable={ready} inert={locked} />
        <main className="workspace" inert={locked}>
          <MediaBin supported={canImport} ready={ready} />
          <Preview editable={ready} />
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
