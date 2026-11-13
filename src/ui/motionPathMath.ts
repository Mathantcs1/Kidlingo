// DOM-free motion-path sampling (Plan 5 Task 10, read-only in 5A): the position keys of a clip, evaluated through
// positionAt (one eased fraction for x and y; curved segments along their Bezier, 5B D6) at one sample per frame, in
// FORMAT px (centre + offset, like the handles). Loops (5B D4) are not drawn: the path shows the keyed span, which
// every repeat/ping-pong cycle retraces (an offset cycle draws the same shape shifted).
import { keyVisible, localRange, positionAt, segmentIndex } from '../core/keyframes';
import { isCurved } from '../core/pathCurve';
import type { Clip, PositionKeyframe, Project } from '../core/model';
import { findClip } from '../core/timeline';
import { clipCentre } from '../render/overlayGeometry';
import type { Point } from '../render/overlayGeometry';
import type { Size } from '../render/geometry';
import { liveSelection } from './edits';

/** At most this many points per path (a long clip is sampled every few frames instead of every frame). */
export const MAX_PATH_SAMPLES = 2000;
/** A curved segment spanning fewer frames than this is drawn with this many evenly timed points (5B D6), budget allowing. */
export const CURVE_POINTS = 24;
const EDGE = 1e-9;
/** Radius of a key dot in CSS px, and how far from the displayed clip centre a dot lets a press through to the move handle. */
export const DOT_R = 5;
export const PASS_THROUGH_PX = DOT_R + 4;

/** Whether the key dot at `dot` (CSS px) must ignore the pointer because it sits on the clip centre (a press there drags the clip). */
export function dotPassesThrough(dot: Point, centre: Point | null): boolean {
  return centre !== null && Math.hypot(dot.x - centre.x, dot.y - centre.y) <= PASS_THROUGH_PX;
}
const ZERO = { scale: 1, rotation: 0, opacity: 1 };

/** A position key as drawn: local time `u` and its position in format px. */
export interface PathKey extends Point { u: number }
/** `runs`: polylines in format px; a hold segment ends one run and starts the next (a jump, not a line). */
export interface MotionPathData { runs: Point[][]; keys: PathKey[] }

const toFormat = (p: { x: number; y: number }, format: Size): Point => clipCentre({ x: p.x, y: p.y, ...ZERO }, format);

/**
 * The path of `clip`'s position keys over the part of its visible local range between the first and last key (an end
 * inside the range is the key itself, an end beyond an edge is cut there). One point per frame on the clip's own frame
 * grid (so points are the frames the preview shows), every key in range exactly, sparser (whole frames) when the span
 * would need more than MAX_PATH_SAMPLES. A short curved segment gets CURVE_POINTS points so the curve reads as a curve
 * (when the key count keeps that within the budget). One key: no run, only its dot. Dots exist for visible keys only.
 */
export function sampleMotionPath(clip: Clip, fps: number, format: Size): MotionPathData {
  const list = clip.keys?.position ?? [];
  const out: MotionPathData = { runs: [], keys: [] };
  if (list.length === 0) return out;
  for (const k of list) if (keyVisible(clip, k.t)) out.keys.push({ u: k.t, ...toFormat(k, format) });
  const [lo, hi] = localRange(clip);
  const a = Math.max(list[0].t, lo);
  const b = Math.min(list[list.length - 1].t, hi - 1 / fps); // end exclusive: the last visible frame
  if (!(b - a > EDGE)) return out;

  const inner = list.filter((k) => k.t > a + EDGE && k.t < b - EDGE);
  const bounds = [a, ...inner.map((k) => k.t), b];
  const budget = Math.max(16, MAX_PATH_SAMPLES - bounds.length - 2);
  const stride = Math.max(1, Math.ceil(((b - a) * fps) / budget));
  const dt = stride / fps;
  const at = (u: number): Point => toFormat(positionAt(list, u), format);
  // The ease of the key segment containing local time `u` (the last key at or before it).
  const easeAfter = (u: number) => (list.filter((k) => k.t <= u + EDGE).pop() ?? list[0]).ease;
  const isKey = (u: number): boolean => list.some((k) => Math.abs(k.t - u) < EDGE);
  const dense = list.length * CURVE_POINTS <= MAX_PATH_SAMPLES / 2;
  const curved = (s: number, e: number): boolean => {
    const i = segmentIndex(list, (s + e) / 2);
    return i >= 0 && i + 1 < list.length && isCurved(list[i], list[i + 1]);
  };

  let run: Point[] = [at(a)];
  for (let i = 0; i + 1 < bounds.length; i++) {
    const s = bounds[i];
    const e = bounds[i + 1];
    if (easeAfter(s).kind === 'hold' && isKey(e)) {
      // The picture holds the position at `s` until the key at `e`, then jumps: end the run, start the next there.
      out.runs.push(run);
      run = [at(e)];
      continue;
    }
    if (dense && (e - s) / dt < CURVE_POINTS && curved(s, e)) {
      for (let j = 1; j <= CURVE_POINTS; j++) run.push(at(j === CURVE_POINTS ? e : s + ((e - s) * j) / CURVE_POINTS));
      continue;
    }
    for (let n = Math.floor((s - lo) / dt + EDGE) + 1; lo + n * dt < e - EDGE; n++) run.push(at(lo + n * dt));
    run.push(at(e));
  }
  out.runs.push(run);
  out.runs = out.runs.filter((r) => r.length >= 2); // a lone point is no line
  return out;
}

const cache = new WeakMap<PositionKeyframe[], { sig: string; data: MotionPathData }>();

/**
 * `sampleMotionPath` memoised on the position key list (an edit makes a new array, so playback frames, selection and
 * moves reuse the same object; every path edit (key move, tangents, smooth) makes a new list too, 5B D6); the
 * signature covers what else the result depends on: the visible range, fps, format.
 */
export function cachedMotionPath(clip: Clip, fps: number, format: Size): MotionPathData {
  const list = clip.keys?.position;
  if (!list) return sampleMotionPath(clip, fps, format);
  const [lo, hi] = localRange(clip);
  const sig = `${lo}|${hi}|${fps}|${format.width}x${format.height}`;
  const hit = cache.get(list);
  if (hit && hit.sig === sig) return hit.data;
  const data = sampleMotionPath(clip, fps, format);
  cache.set(list, { sig, data });
  return data;
}

/**
 * The clip that shows a motion path: exactly one live selected video/image/overlay clip with at least one position key
 * on a track that is not hidden (the handles hide with it). A locked track keeps the path: it is read-only anyway.
 */
export function motionPathTarget(p: Project, selection: string[]): Clip | null {
  const live = liveSelection(p, selection);
  if (live.length !== 1) return null;
  const { clip, track } = findClip(p, live[0]);
  if (track.hidden || clip.kind === 'audio' || clip.kind === 'adjustment') return null;
  return (clip.keys?.position?.length ?? 0) > 0 ? clip : null;
}
