import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { audioStats, resetAudioStats } from './audio/stats';
import type { AudioStats } from './audio/stats';
import type { Id, MediaRef, VideoEffectType } from './core/model';
import { peaksDecodeCount } from './media/peaks';
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
  /** Waveform peak computations by decoding (cache hits excluded; see media/peaks). */
  peaksDecodeCount(): number;
  /** The LUT import command (ui/lutCommands; Task 10's picker calls it from a file input). */
  importLutFiles(files: File[]): Promise<MediaRef[]>;
  /** The media bin's remove command (ui/projectCommands). */
  removeMediaItem(id: Id): Promise<void>;
  /** Runs media GC against the current history now; returns the removed ids. */
  gcMedia(): Promise<Id[]>;
  /** Replaces the shader of an effect type with one that does not compile (the D8 failure path, Task 11). */
  breakVideoEffect(type: VideoEffectType): Promise<void>;
  /** Makes the blend shader fail to compile in compositors created from now on (blend-unavailable path). */
  breakBlendProgram(): Promise<void>;
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
    peaksDecodeCount,
    importLutFiles: async (files) => (await import('./ui/lutCommands')).importLutFiles(files),
    removeMediaItem: async (id) => (await import('./ui/projectCommands')).removeMediaItem(id),
    gcMedia: async () => {
      const { gcMedia, referencedMedia } = await import('./media/gc');
      return gcMedia(() => referencedMedia(useEditor.getState().history));
    },
    breakVideoEffect: async (type) => {
      const { registerPassShader } = await import('./render/effects/registry');
      registerPassShader(type, { fragment: '#version 300 es\nclipforge test: does not compile;', uniforms: () => ({}) });
    },
    breakBlendProgram: async () => {
      const { setBlendFragmentOverride } = await import('./render/blendProgram');
      setBlendFragmentOverride('#version 300 es\nclipforge test: does not compile;');
    },
  };
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
