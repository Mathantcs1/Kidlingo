import { useEffect, useState } from 'react';
import { hasWebCodecs } from './media/support';
import Banner from './ui/Banner';
import FormatPicker from './ui/FormatPicker';
import MediaBin from './ui/MediaBin';
import PreviewSlot from './ui/PreviewSlot';
import Timeline from './ui/Timeline';
import Toasts from './ui/Toast';
import Toolbar from './ui/Toolbar';
import { restoreSessionOnce } from './ui/session';
import { useShortcuts } from './ui/useShortcuts';

const webCodecs = hasWebCodecs();

export default function App() {
  const [ready, setReady] = useState(false);
  // Editing stays inert until the saved session is restored, so a restore never discards new edits.
  useShortcuts(ready);
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
    <div className="app" data-testid="app" data-session={ready ? 'ready' : 'loading'}>
      <Banner supported={webCodecs} />
      <header className="topbar">
        <h1 className="logo">ClipForge</h1>
        <FormatPicker disabled={!ready} />
      </header>
      <main className="workspace">
        <MediaBin supported={webCodecs} ready={ready} />
        <PreviewSlot />
      </main>
      <Toolbar editable={ready} />
      <Timeline />
      <Toasts />
    </div>
  );
}
