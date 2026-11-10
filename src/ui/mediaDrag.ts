// Shared state for dragging media from the bin onto the timeline (HTML5 drag and drop).
import type { Id } from '../core/model';

/** Drag data type carrying a media id. */
export const MEDIA_MIME = 'application/x-clipforge-media';

let dragged: Id | null = null;

/** The media being dragged right now (drag data cannot be read during dragover, so it is kept here too). */
export function draggedMedia(): Id | null {
  return dragged;
}

export function setDraggedMedia(id: Id | null): void {
  dragged = id;
}
