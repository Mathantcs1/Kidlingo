// Pure edits of a clip's crop, flip and anchor (Plan 5E D2, D3, D4, D8). Video and image clips only; locked tracks and
// non-finite values are refused; a no-op returns the SAME project (no undo step). One call = one undo step.
import { ANIMATED_REFUSAL } from './animTargets';
import { frameFractionAt } from './cropDrag';
import { ANCHOR_LIMIT, MAX_CROP_EDGE, clampCrop, cropMinimum, normaliseCrop } from './cropTypes';
import type { Anchor, Crop, Flip } from './cropTypes';
import type { Clip, Id, Project } from './model';
import { TimelineError, assertUnlocked, findClip, replaceClip } from './timeline';
import { REACH } from './transformLimits';

const EDGES = ['left', 'top', 'right', 'bottom'] as const;
const OPPOSITE = { left: 'right', right: 'left', top: 'bottom', bottom: 'top' } as const;

function target(p: Project, clipId: Id): Clip {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  if (clip.kind !== 'video' && clip.kind !== 'image') throw new TimelineError('Crop, flip and anchor apply to video and image clips');
  return clip;
}

/** Replaces `field` of the clip (removed when undefined); `p` itself when nothing changes. */
function put<K extends 'crop' | 'flip' | 'anchor'>(p: Project, clip: Clip, field: K, value: Clip[K] | undefined): Project {
  if (JSON.stringify(clip[field]) === JSON.stringify(value)) return p;
  const { [field]: _old, ...rest } = clip;
  return replaceClip(p, clip.id, (value === undefined ? rest : { ...rest, [field]: value }) as Clip);
}

/** The smallest fraction of each axis that must stay visible: 2 %, or 8 source pixels when the size is known (D2). */
function minRemaining(p: Project, clip: Clip): { x: number; y: number } {
  const m = p.media[clip.mediaId];
  return { x: cropMinimum(m?.width), y: cropMinimum(m?.height) };
}

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** Sets the given edges (fractions of the displayed frame); each edited edge is capped so the opposite one is kept (D2). */
export function setCrop(p: Project, clipId: Id, patch: Partial<Crop>): Project {
  for (const k of EDGES) if (patch[k] !== undefined && !finite(patch[k])) throw new TimelineError('Invalid crop value');
  const clip = target(p, clipId);
  const min = minRemaining(p, clip);
  const next: Crop = { left: 0, top: 0, right: 0, bottom: 0, ...clip.crop };
  for (const k of EDGES) {
    const v = patch[k];
    if (v === undefined) continue;
    const room = 1 - (k === 'left' || k === 'right' ? min.x : min.y) - next[OPPOSITE[k]];
    next[k] = Math.max(0, Math.min(v, MAX_CROP_EDGE, room)) + 0;
  }
  return put(p, clip, 'crop', normaliseCrop(clampCrop(next, min.x, min.y)));
}

export function resetCrop(p: Project, clipId: Id): Project {
  return put(p, target(p, clipId), 'crop', undefined);
}

/** Sets or clears the mirrors named in `patch` (`false` clears; false is never stored). */
export function setFlip(p: Project, clipId: Id, patch: { h?: boolean; v?: boolean }): Project {
  const clip = target(p, clipId);
  const flip: Flip = { ...clip.flip };
  for (const k of ['h', 'v'] as const) {
    if (patch[k] === true) flip[k] = true;
    else if (patch[k] === false) delete flip[k];
  }
  return put(p, clip, 'flip', flip.h || flip.v ? flip : undefined);
}

/** A keyed anchor is edited at the playhead (setValueAt), never through the static edits (5E D5, like every keyed property). */
function assertStaticAnchor(clip: Clip): void {
  if ((clip.keys?.anchor?.length ?? 0) > 0) throw new TimelineError(ANIMATED_REFUSAL);
}

/** Moves the pivot (fractions of the full frame from its centre, ±2). The picture moves with it (D4, no compensation). */
export function setAnchor(p: Project, clipId: Id, a: Anchor): Project {
  if (!finite(a.x) || !finite(a.y)) throw new TimelineError('Invalid anchor value');
  const clip = target(p, clipId);
  assertStaticAnchor(clip);
  const c = (v: number): number => Math.min(ANCHOR_LIMIT, Math.max(-ANCHOR_LIMIT, v)) + 0;
  const next = { x: c(a.x), y: c(a.y) };
  return put(p, clip, 'anchor', next.x === 0 && next.y === 0 ? undefined : next);
}

export function resetAnchor(p: Project, clipId: Id): Project {
  const clip = target(p, clipId);
  assertStaticAnchor(clip);
  return put(p, clip, 'anchor', undefined);
}

/** Pivot = the centre of the visible rectangle (the pivot moves, so does the picture: D4). */
export function anchorToCropCentre(p: Project, clipId: Id): Project {
  const clip = target(p, clipId);
  const c = clip.crop;
  return setAnchor(p, clipId, c ? { x: (c.left - c.right) / 2, y: (c.top - c.bottom) / 2 } : { x: 0, y: 0 });
}

/**
 * Scales and places the clip so its visible (cropped) rectangle fits or fills the canvas, centred (D8). Keeps the
 * rotation and opacity; the scale ignores the rotation (like Reset). Refused while position or scale are keyed; a
 * clip without a crop, or media of unknown size, is left as it is.
 */
export function fitToCrop(p: Project, clipId: Id, mode: 'fit' | 'fill'): Project {
  const clip = target(p, clipId);
  const m = p.media[clip.mediaId];
  const crop = clip.crop;
  if (!crop || !m?.width || !m.height) return p;
  // The result depends on the pivot too: a keyed anchor has no single pivot to place the crop centre from.
  if ((clip.keys?.position?.length ?? 0) > 0 || (clip.keys?.scale?.length ?? 0) > 0 || (clip.keys?.anchor?.length ?? 0) > 0) throw new TimelineError(ANIMATED_REFUSAL);
  const cw = m.width * (1 - crop.left - crop.right);
  const ch = m.height * (1 - crop.top - crop.bottom);
  const sx = p.format.width / cw;
  const sy = p.format.height / ch;
  const scale = mode === 'fill' ? Math.max(sx, sy) : Math.min(sx, sy);
  // Local offset (frame px) of the crop centre from the pivot; the clip position puts that point at the canvas centre.
  const a = clip.anchor ?? { x: 0, y: 0 };
  const lx = ((crop.left - crop.right) / 2 - a.x) * m.width * scale;
  const ly = ((crop.top - crop.bottom) / 2 - a.y) * m.height * scale;
  const rad = (clip.transform.rotation * Math.PI) / 180;
  const x = -(lx * Math.cos(rad) - ly * Math.sin(rad)) + 0;
  const y = -(lx * Math.sin(rad) + ly * Math.cos(rad)) + 0;
  const t = clip.transform;
  if (t.x === x && t.y === y && t.scale === scale) return p;
  return replaceClip(p, clipId, { ...clip, transform: { ...t, x, y, scale } });
}

/**
 * Moves the pivot to the canvas point `point` (format px from the canvas top-left) WITHOUT moving the picture: the new
 * anchor is where the point falls on the frame, and x/y become the point's offset from the canvas centre (the on-canvas
 * pivot drag). Exact only while position, scale, rotation and anchor are static, so it is refused otherwise; refused
 * too for media of unknown size. A move that changes nothing returns `p`.
 */
export function movePivotTo(p: Project, clipId: Id, point: { x: number; y: number }): Project {
  if (!finite(point.x) || !finite(point.y)) throw new TimelineError('Invalid pivot position');
  const clip = target(p, clipId);
  const k = clip.keys;
  if ((k?.position?.length ?? 0) + (k?.scale?.length ?? 0) + (k?.rotation?.length ?? 0) + (k?.anchor?.length ?? 0) > 0) throw new TimelineError(ANIMATED_REFUSAL);
  const m = p.media[clip.mediaId];
  if (!m?.width || !m.height) throw new TimelineError('This clip has no known size');
  if (!(clip.transform.scale > 0) || !Number.isFinite(clip.transform.scale)) throw new TimelineError('The pivot cannot be moved while the clip has no size');
  const f = frameFractionAt(point, clip.transform, { width: m.width, height: m.height }, clip.anchor, p.format);
  const anchor = { x: f.u - 0.5 + 0, y: f.v - 0.5 + 0 };
  const x = point.x - p.format.width / 2 + 0;
  const y = point.y - p.format.height / 2 + 0;
  // Clamping would make the picture jump (the pivot must stay exactly where the picture says it is): refuse instead.
  const far = !Number.isFinite(anchor.x + anchor.y) || Math.abs(anchor.x) > ANCHOR_LIMIT || Math.abs(anchor.y) > ANCHOR_LIMIT
    || Math.abs(x) > REACH * p.format.width || Math.abs(y) > REACH * p.format.height;
  if (far) throw new TimelineError('The pivot cannot go that far from the picture');
  const same = anchor.x === (clip.anchor?.x ?? 0) && anchor.y === (clip.anchor?.y ?? 0) && x === clip.transform.x && y === clip.transform.y;
  if (same) return p;
  const { anchor: _old, ...rest } = clip;
  const next: Clip = { ...rest, transform: { ...clip.transform, x, y }, ...(anchor.x === 0 && anchor.y === 0 ? {} : { anchor }) };
  return replaceClip(p, clipId, next);
}
