// Which clip the on-canvas crop mode is on (Plan 5E Task 6). UI state, never history: it ends when the selection
// changes (CropOverlay unmounts) and is reset by the toggle.
import { create } from 'zustand';
import type { Id } from '../core/model';

export const useCropMode = create<{ clipId: Id | null }>()(() => ({ clipId: null }));

export const toggleCropMode = (clipId: Id): void =>
  useCropMode.setState((s) => ({ clipId: s.clipId === clipId ? null : clipId }));
export const endCropMode = (): void => useCropMode.setState({ clipId: null });
