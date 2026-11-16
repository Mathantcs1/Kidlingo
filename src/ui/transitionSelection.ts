// Which transition chip is selected (Plan 5C D13): UI state like keySelection.ts, not history. Cleared when the clip
// selection changes, on undo/redo, when an edit removes it, and by Escape.
import { create } from 'zustand';
import type { Id } from '../core/model';
import { useEditor } from '../state/store';

export const useTransitionSelection = create<{ id: Id | null }>()(() => ({ id: null }));

export const selectedTransitionId = (): Id | null => useTransitionSelection.getState().id;
export const setSelectedTransition = (id: Id | null): void => {
  if (id !== selectedTransitionId()) useTransitionSelection.setState({ id });
};
export const hasSelectedTransition = (): boolean => selectedTransitionId() !== null;

/** Escape: drops the selection; true only when there was one (the caller then marks the event as used). */
export function dropTransitionSelectionOnEscape(): boolean {
  if (!hasSelectedTransition()) return false;
  setSelectedTransition(null);
  return true;
}

useEditor.subscribe((now, prev) => {
  const id = selectedTransitionId();
  if (id === null) return;
  if (now.selection !== prev.selection && now.selection.length > 0) return setSelectedTransition(null);
  const h = now.history;
  const ph = prev.history;
  if (h.present === ph.present) return;
  if (h.present === ph.past[ph.past.length - 1] || h.present === ph.future[0]) return setSelectedTransition(null);
  if (!h.present.tracks.some((t) => t.transitions?.some((x) => x.id === id))) setSelectedTransition(null);
});
