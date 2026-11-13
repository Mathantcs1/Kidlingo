import { useEffect } from 'react';
import { useEaseEditor, openEase } from './easeEditorStore';
import { setEaseOpener } from './keySelectionCommands';
import EasePanel from './EasePanel';

/** Mounted once: registers the opener the timeline diamonds call (Enter / double-click) and shows the panel. */
export default function EaseEditorHost() {
  const open = useEaseEditor((s) => s.open);
  useEffect(() => {
    setEaseOpener(openEase);
    return () => setEaseOpener(null);
  }, []);
  return open ? <EasePanel key={open.id} open={open} /> : null;
}
