import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { audioStats, resetAudioStats } from './audio/stats';
import type { AudioStats } from './audio/stats';
import type { Id } from './core/model';
import { listMediaIds, removeMedia } from './media/storage';
import { flushAutosave, useEditor } from './state/store';
import type { EditorActions, EditorState } from './state/store';
import './ui/styles.css';

/** Dev-only hooks for the Playwright suite; never present in production builds. */
interface DevHook {
  removeMedia(id: Id): Promise<void>;
  listMediaIds(): Promise<Id[]>;
  flushAutosave(): Promise<void>;
  getState(): EditorState & EditorActions;
  /** Open/peak counts of video decoders (see media/decode). */
  videoSourceStats(): Promise<{ open: number; peak: number; opened: number }>;
  /** Audio buffer sizes and live playback nodes (see audio/stats). */
  audioStats(): AudioStats;
  resetAudioStats(): void;
}

declare global {
  interface Window {
    __clipforge?: DevHook;
  }
}

if (import.meta.env.DEV) {
  window.__clipforge = {
    removeMedia,
    listMediaIds,
    flushAutosave,
    getState: () => useEditor.getState(),
    videoSourceStats: async () => (await import('./media/decode')).videoSourceStats(),
    audioStats,
    resetAudioStats,
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
