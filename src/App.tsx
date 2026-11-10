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
  useShortcuts();
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
        <FormatPicker />
      </header>
      <main className="workspace">
        <MediaBin canImport={webCodecs} />
        <PreviewSlot />
      </main>
      <Toolbar />
      <Timeline />
      <Toasts />
    </div>
  );
}
