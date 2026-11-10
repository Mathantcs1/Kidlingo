import { create } from 'zustand';
import type { Id, Project } from '../core/model';
import { emptyProject } from '../core/model';
import { TimelineError } from '../core/timeline';
import { commit, createHistory, redo, undo } from './history';
import type { History } from './history';
import { describeStorageError } from '../media/storageErrors';
import { saveProject } from './persist';

export interface EditorState {
  history: History<Project>;
  selection: Id[];
  playhead: number;
  playing: boolean;
  lastError: string | null;
  /** Why the last autosave failed, or null while saving works (set by the autosave below). */
  saveError: string | null;
}

export interface EditorActions {
  apply(fn: (p: Project) => Project): void;
  undo(): void;
  redo(): void;
  select(ids: Id[]): void;
  setPlayhead(t: number): void;
  setPlaying(b: boolean): void;
  loadProject(p: Project): void;
}

function clipIds(p: Project): Set<Id> {
  return new Set(p.tracks.flatMap((t) => t.clips.map((c) => c.id)));
}

/** The selection without ids missing from `p`; the same array when nothing was dropped. */
function pruneSelection(selection: Id[], p: Project): Id[] {
  const ids = clipIds(p);
  const pruned = selection.filter((id) => ids.has(id));
  return pruned.length === selection.length ? selection : pruned;
}

export const useEditor = create<EditorState & EditorActions>()((set, get) => ({
  history: createHistory(emptyProject()),
  selection: [],
  playhead: 0,
  playing: false,
  lastError: null,
  saveError: null,

  apply(fn) {
    const { history, selection } = get();
    let next: Project;
    try {
      next = fn(history.present);
    } catch (e) {
      if (e instanceof TimelineError) {
        set({ lastError: e.message });
        return;
      }
      throw e;
    }
    set({
      history: commit(history, next),
      selection: pruneSelection(selection, next),
      lastError: null,
    });
  },
  undo() {
    set((s) => {
      const history = undo(s.history);
      return { history, selection: pruneSelection(s.selection, history.present), lastError: null };
    });
  },
  redo() {
    set((s) => {
      const history = redo(s.history);
      return { history, selection: pruneSelection(s.selection, history.present), lastError: null };
    });
  },
  select(ids) {
    set({ selection: ids });
  },
  setPlayhead(t) {
    set({ playhead: t });
  },
  setPlaying(b) {
    set({ playing: b });
  },
  loadProject(p) {
    set({
      history: createHistory(p),
      selection: [],
      playhead: 0,
      playing: false,
      lastError: null,
    });
  },
}));

// Autosave: debounced 500 ms on history.present change only; no-op without IndexedDB or while disabled (a tab that
// does not hold the editor lock never writes the shared saved project).
const hasIdb = (): boolean => typeof indexedDB !== 'undefined';
let enabled = true;
let timer: ReturnType<typeof setTimeout> | undefined;
let dirty: Project | null = null;
// Serialises writes; never rejects (failures are reported to the caller of enqueue()).
let chain: Promise<void> = Promise.resolve();

export function setAutosaveEnabled(on: boolean): void {
  enabled = on;
  if (on) return;
  if (timer !== undefined) clearTimeout(timer);
  timer = undefined;
  dirty = null;
}

/** Records the outcome in `saveError` (only on change, so the UI reports a failure and the recovery once each). */
function report(error: unknown): void {
  const saveError = error === null ? null : describeStorageError(error);
  if (useEditor.getState().saveError !== saveError) useEditor.setState({ saveError });
}

function enqueue(): Promise<void> {
  const p = dirty;
  dirty = null;
  if (!p || !hasIdb() || !enabled) return Promise.resolve();
  const run = chain.then(() => saveProject(p));
  chain = run.catch(() => undefined);
  return run.then(
    () => report(null),
    (e: unknown) => {
      // Keep the failed project for retry unless a newer change has arrived.
      if (dirty === null) dirty = p;
      report(e);
      throw e;
    },
  );
}

/** Saves any pending change now and resolves once all writes are durable; rejects if a save fails. */
export async function flushAutosave(): Promise<void> {
  if (timer !== undefined) {
    clearTimeout(timer);
    timer = undefined;
  }
  await chain;
  await enqueue();
}

/**
 * Flushes the pending change when the page is hidden or unloaded (closing within the 500 ms debounce would
 * otherwise lose the last edit). Returns a function that removes the listeners.
 */
export function flushOnHide(win: EventTarget, doc: EventTarget & { visibilityState: DocumentVisibilityState }): () => void {
  const flush = (): void => {
    if (timer === undefined && dirty === null) return;
    flushAutosave().catch(() => undefined); // reported through saveError
  };
  const onVisibility = (): void => {
    if (doc.visibilityState === 'hidden') flush();
  };
  doc.addEventListener('visibilitychange', onVisibility);
  win.addEventListener('pagehide', flush);
  return () => {
    doc.removeEventListener('visibilitychange', onVisibility);
    win.removeEventListener('pagehide', flush);
  };
}

useEditor.subscribe((s, prev) => {
  if (s.history.present === prev.history.present || !hasIdb() || !enabled) return;
  dirty = s.history.present;
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    enqueue().catch(() => undefined); // reported through saveError (the UI shows it)
  }, 500);
});
