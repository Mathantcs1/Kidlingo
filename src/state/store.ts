import { create } from 'zustand';
import type { Id, Project } from '../core/model';
import { emptyProject } from '../core/model';
import { TimelineError } from '../core/timeline';
import { commit, createHistory, redo, undo } from './history';
import type { History } from './history';
import { saveProject } from './persist';

export interface EditorState {
  history: History<Project>;
  selection: Id[];
  playhead: number;
  playing: boolean;
  lastError: string | null;
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

// Autosave: debounced 500 ms on history.present change only; no-op without IndexedDB.
const hasIdb = (): boolean => typeof indexedDB !== 'undefined';
let timer: ReturnType<typeof setTimeout> | undefined;
let dirty: Project | null = null;
// Serialises writes; never rejects (failures are reported to the caller of enqueue()).
let chain: Promise<void> = Promise.resolve();

function enqueue(): Promise<void> {
  const p = dirty;
  dirty = null;
  if (!p || !hasIdb()) return Promise.resolve();
  const run = chain.then(() => saveProject(p));
  chain = run.catch(() => undefined);
  return run.catch((e: unknown) => {
    // Keep the failed project for retry unless a newer change has arrived.
    if (dirty === null) dirty = p;
    throw e;
  });
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

useEditor.subscribe((s, prev) => {
  if (s.history.present === prev.history.present || !hasIdb()) return;
  dirty = s.history.present;
  if (timer !== undefined) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = undefined;
    enqueue().catch((e: unknown) => console.error('clipforge: autosave failed', e));
  }, 500);
});
