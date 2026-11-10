import { useEffect, useState } from 'react';
import { hasWebCodecs } from './media/support';
import Banner from './ui/Banner';
import FormatPicker from './ui/FormatPicker';
import MediaBin from './ui/MediaBin';
import ExportDialog from './ui/ExportDialog';
import { useExportUi } from './ui/exportJob';
import Preview from './ui/Preview';
import Timeline from './ui/Timeline';
import Toasts from './ui/Toast';
import Toolbar from './ui/Toolbar';
import { restoreSessionOnce } from './ui/session';
import { usePlayback } from './ui/usePlayback';
import { useShortcuts } from './ui/useShortcuts';

const webCodecs = hasWebCodecs();

export default function App() {
  const [ready, setReady] = useState(false);
  const dialogOpen = useExportUi((s) => s.open !== null);
  // Editing stays inert until the saved session is restored, so a restore never discards new edits, and
  // while the export dialog is open (the editor behind it is `inert`).
  useShortcuts(ready && !dialogOpen);
  usePlayback();
  useEffect(() => {
    let live = true;
    void restoreSessionOnce().then(() => {
      if (live) setReady(true);
    });
    return () => {
      live = false;
    };
  }, []);

  return (
    <>
      <div className="app" data-testid="app" data-session={ready ? 'ready' : 'loading'} inert={dialogOpen}>
        <Banner supported={webCodecs} />
        <header className="topbar">
          <h1 className="logo">ClipForge</h1>
          <FormatPicker disabled={!ready} />
        </header>
        <main className="workspace">
          <MediaBin supported={webCodecs} ready={ready} />
          <Preview />
        </main>
        <Toolbar editable={ready} />
        <Timeline />
      </div>
      {dialogOpen && <ExportDialog />}
      <Toasts />
    </>
  );
}
