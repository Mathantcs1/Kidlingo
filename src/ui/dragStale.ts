import type { Clip, Project, Transform } from '../core/model';

/** What a transform drag captured from the store at the press (see useTransformDrag). */
export interface DragSnapshot {
  clipId: string;
  /** The store's transform and keys objects at the press: if anything else replaces them, the drag's start is stale. */
  storeTransform: Transform;
  storeKeys: Clip['keys'];
  /** The store's preset stack at the press (5B): optional; when given, replacing it also ends the drag. */
  storeMotion?: Clip['motion'];
  format: { width: number; height: number };
}

/**
 * True when a store change (`prev` -> `p`) invalidates a running drag (a transform drag, or a motion path drag: its
 * key list lives in `keys`): the clip is gone, its transform, keys (the path) or, when snapshotted, preset stack were
 * replaced, the format size changed, or the frame rate changed. Unrelated edits leave the drag running.
 */
export function isStaleDrag(g: DragSnapshot, p: Project, prev: Project): boolean {
  if (p === prev) return false;
  const now = p.tracks.flatMap((t) => t.clips).find((c) => c.id === g.clipId);
  const stale = !now || now.transform !== g.storeTransform || now.keys !== g.storeKeys || ('storeMotion' in g && now.motion !== g.storeMotion);
  return stale || p.format.width !== g.format.width || p.format.height !== g.format.height || p.format.fps !== prev.format.fps;
}
