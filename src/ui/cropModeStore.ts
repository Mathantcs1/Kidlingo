// Which clip the on-canvas crop mode is on (Plan 5E Task 6). UI state, never history: it ends when the selection
// changes (CropOverlay unmounts) and is reset by the toggle.
import { create } from 'zustand';
import type { Id } from '../core/model';
import { useEditor } from '../state/store';

export const useCropMode = create<{ clipId: Id | null }>()(() => ({ clipId: null }));

export const toggleCropMode = (clipId: Id): void =>
  useCropMode.setState((s) => ({ clipId: s.clipId === clipId ? null : clipId }));
export const endCropMode = (): void => useCropMode.setState({ clipId: null });

// Crop mode belongs to the ONE selected clip: any selection change that is not exactly that clip ends it, even while
// the preview overlay is not mounted (an overlay going away must not leave the toggle pressed).
useEditor.subscribe((s) => {
  const id = useCropMode.getState().clipId;
  if (id !== null && !(s.selection.length === 1 && s.selection[0] === id)) endCropMode();
});
