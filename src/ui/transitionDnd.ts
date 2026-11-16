// Shared state for dragging a transition tile from the browser onto a cut (HTML5 drag and drop), like mediaDrag.ts.
import type { TransitionType } from '../core/transitionTypes';

/** Drag data type carrying a transition type. */
export const TRANSITION_MIME = 'application/x-clipforge-transition';

let dragged: TransitionType | null = null;

/** The transition type being dragged right now (drag data cannot be read during dragover). */
export const draggedTransition = (): TransitionType | null => dragged;
export const setDraggedTransition = (t: TransitionType | null): void => {
  dragged = t;
};
export const isTransitionDrag = (e: { dataTransfer: DataTransfer }): boolean => e.dataTransfer.types.includes(TRANSITION_MIME) || dragged !== null;
