import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
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
}

declare global {
  interface Window {
    __clipforge?: DevHook;
  }
}

if (import.meta.env.DEV) {
  window.__clipforge = { removeMedia, listMediaIds, flushAutosave, getState: () => useEditor.getState() };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
