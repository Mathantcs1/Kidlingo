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
    const ids = clipIds(next);
    const pruned = selection.filter((id) => ids.has(id));
    set({
      history: commit(history, next),
      selection: pruned.length === selection.length ? selection : pruned,
      lastError: null,
    });
  },
  undo() {
    set((s) => ({ history: undo(s.history), lastError: null }));
  },
  redo() {
    set((s) => ({ history: redo(s.history), lastError: null }));
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
const hasIdb = typeof indexedDB !== 'undefined';
let timer: ReturnType<typeof setTimeout> | undefined;
let dirty: Project | null = null;

function write(): Promise<void> {
  timer = undefined;
  const p = dirty;
  dirty = null;
  return p && hasIdb ? saveProject(p) : Promise.resolve();
}

export function flushAutosave(): Promise<void> {
  if (timer !== undefined) clearTimeout(timer);
  return write();
}

if (hasIdb) {
  useEditor.subscribe((s, prev) => {
    if (s.history.present === prev.history.present) return;
    dirty = s.history.present;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => void write(), 500);
  });
}
