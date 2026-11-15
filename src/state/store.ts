import { create } from 'zustand';
import type { Id, Project } from '../core/model';
import { emptyProject } from '../core/model';
import { TimelineError } from '../core/timeline';
import { commit, createHistory, redo, undo } from './history';
import type { History } from './history';
import { bindAutosave, schedule } from './autosave';
import { reconcileUi } from './selection';

export interface EditorState {
  history: History<Project>;
  selection: Id[];
  /** The track new media is added to (UI state like `selection`: not saved, not part of undo). */
  activeTrackId: Id | null;
  playhead: number;
  playing: boolean;
  lastError: string | null;
  /** Why the last autosave failed, or null while saving works (set by the autosave below). */
  saveError: string | null;
  /** Counts loadProject calls (New project, session restore): UI stores holding project-bound data reset on a change. */
  epoch: number;
}

export interface EditorActions {
  apply(fn: (p: Project) => Project): void;
  undo(): void;
  redo(): void;
  select(ids: Id[]): void;
  /** Unknown ids are ignored; null clears. */
  setActiveTrack(id: Id | null): void;
  setPlayhead(t: number): void;
  setPlaying(b: boolean): void;
  loadProject(p: Project): void;
}

export const useEditor = create<EditorState & EditorActions>()((set, get) => ({
  history: createHistory(emptyProject()),
  selection: [],
  activeTrackId: null,
  playhead: 0,
  playing: false,
  lastError: null,
  saveError: null,
  epoch: 0,

  apply(fn) {
    const { history } = get();
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
      ...reconcileUi(get(), next),
      lastError: null,
    });
  },
  undo() {
    set((s) => {
      const history = undo(s.history);
      const p = history.present;
      return { history, ...reconcileUi(s, p), lastError: null };
    });
  },
  redo() {
    set((s) => {
      const history = redo(s.history);
      const p = history.present;
      return { history, ...reconcileUi(s, p), lastError: null };
    });
  },
  select(ids) {
    set({ selection: ids });
  },
  setActiveTrack(id) {
    if (id !== null && !get().history.present.tracks.some((t) => t.id === id)) return;
    set({ activeTrackId: id });
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
      activeTrackId: null,
      playhead: 0,
      playing: false,
      lastError: null,
      epoch: get().epoch + 1,
    });
  },
}));

bindAutosave(useEditor);
useEditor.subscribe((s, prev) => {
  if (s.history.present !== prev.history.present) schedule(s.history.present);
});

export { flushAutosave, flushOnHide, setAutosaveEnabled } from './autosave';
