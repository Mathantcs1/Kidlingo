// Pure maths of the on-canvas crop drag (Plan 5E Task 6): where a pointer lands on the FULL frame, and the crop a
// grabbed edge or corner gives. Format px with y down, like the overlay geometry; DOM-free.
import { MAX_CROP_EDGE } from './cropTypes';
import type { Anchor, Crop } from './cropTypes';
import type { Clip, Id, Project, Transform } from './model';

export type CropHandle = 'l' | 'r' | 't' | 'b' | 'tl' | 'tr' | 'br' | 'bl';
export const CROP_HANDLES: readonly CropHandle[] = ['tl', 't', 'tr', 'r', 'br', 'b', 'bl', 'l'];

/**
 * The fractions (u, v) of the full frame (0..1 across, v down) under the format point `p`: the inverse of the clip's
 * placement (centre + position, clockwise rotation, scale, pivot). `size` is the full displayed source size.
 */
export function frameFractionAt(
  p: { x: number; y: number }, t: Transform, size: { width: number; height: number }, anchor: Anchor | undefined,
  format: { width: number; height: number },
): { u: number; v: number } {
  const sw = size.width * t.scale;
  const sh = size.height * t.scale;
  const rad = (t.rotation * Math.PI) / 180;
  const dx = p.x - (format.width / 2 + t.x);
  const dy = p.y - (format.height / 2 + t.y);
  // Undo the clockwise rotation (y down): (a, b) = R(-θ)·(dx, dy).
  const a = dx * Math.cos(rad) + dy * Math.sin(rad);
  const b = -dx * Math.sin(rad) + dy * Math.cos(rad);
  return { u: (a + (anchor?.x ?? 0) * sw) / sw + 0.5, v: (b + (anchor?.y ?? 0) * sh) / sh + 0.5 };
}

/**
 * The crop after grabbing `handle` of `start` and dragging it to the frame point (u, v): left/right/top/bottom take
 * u, 1 − u, v, 1 − v; each edge stays within 0..MAX_CROP_EDGE and leaves the opposite edge's crop plus the minimum
 * visible fraction (`minX`, `minY`). Edges the handle does not own are untouched.
 */
export function dragCrop(start: Crop | undefined, handle: CropHandle, u: number, v: number, minX: number, minY: number): Crop {
  const c: Crop = { left: 0, top: 0, right: 0, bottom: 0, ...start };
  const fin = (n: number): number => (Number.isFinite(n) ? n : 0);
  if (handle.includes('l')) c.left = Math.max(0, Math.min(fin(u), MAX_CROP_EDGE, 1 - minX - c.right)) + 0;
  if (handle.includes('r')) c.right = Math.max(0, Math.min(1 - fin(u), MAX_CROP_EDGE, 1 - minX - c.left)) + 0;
  if (handle.includes('t')) c.top = Math.max(0, Math.min(fin(v), MAX_CROP_EDGE, 1 - minY - c.bottom)) + 0;
  if (handle.includes('b')) c.bottom = Math.max(0, Math.min(1 - fin(v), MAX_CROP_EDGE, 1 - minY - c.top)) + 0;
  return c;
}

/** `p` with clip `clipId` drawn at `crop` (all zero = none), for the live preview of a crop drag only: no guards, never committed. */
export function withLiveCrop(p: Project, clipId: Id, crop: Crop | undefined): Project {
  if (!p.tracks.some((t) => t.clips.some((c) => c.id === clipId))) return p;
  const set = (c: Clip): Clip => {
    const { crop: _old, ...rest } = c;
    return crop && (crop.left > 0 || crop.top > 0 || crop.right > 0 || crop.bottom > 0) ? { ...rest, crop } : rest;
  };
  return { ...p, tracks: p.tracks.map((t) => (t.clips.some((c) => c.id === clipId) ? { ...t, clips: t.clips.map((c) => (c.id === clipId ? set(c) : c)) } : t)) };
}
