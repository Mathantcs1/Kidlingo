// DOM-free motion-path sampling (Plan 5 Task 10, read-only in 5A): the position keys of a clip, evaluated through
// positionAt (one eased fraction for x and y; curved segments along their Bezier, 5B D6) at one sample per frame, in
// FORMAT px (centre + offset, like the handles). Loops (5B D4): the path shows the keyed span, which every
// repeat/ping-pong cycle retraces; a Continue (offset) loop draws the same shape shifted, so its next cycles are given
// as shifts (`cycles`, at most MAX_DRAWN_CYCLES; `moreCycles` when the loop continues beyond them, 5B Task 8).
import { keyVisible, localRange, positionAt, segmentIndex } from '../core/keyframes';
import { isCurved } from '../core/pathCurve';
import type { Clip, PositionKeyframe, Project } from '../core/model';
import { targetLoop } from '../core/targetLoops';
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
/** Offset-loop cycles drawn (faintly) after the keyed span. */
export const MAX_DRAWN_CYCLES = 3;
const POSITION = { kind: 'transform', prop: 'position' } as const;

/** Whether the key dot at `dot` (CSS px) must ignore the pointer because it sits on the clip centre (a press there drags the clip). */
export function dotPassesThrough(dot: Point, centre: Point | null): boolean {
  return centre !== null && Math.hypot(dot.x - centre.x, dot.y - centre.y) <= PASS_THROUGH_PX;
}
const ZERO = { scale: 1, rotation: 0, opacity: 1 };

/** A position key as drawn: local time `u` and its position in format px. */
export interface PathKey extends Point { u: number }
/**
 * `runs`: polylines in format px; a hold segment ends one run and starts the next (a jump, not a line). `cycles`: the
 * shifts (format px) of the next offset-loop cycles to draw; `moreCycles`: the loop goes on beyond them.
 */
export interface MotionPathData { runs: Point[][]; keys: PathKey[]; cycles: Point[]; moreCycles: boolean }

/** A position (offset from the canvas centre) in format px, where the handles place a clip centred there. */
export const toFormat = (p: { x: number; y: number }, format: Size): Point => clipCentre({ x: p.x, y: p.y, ...ZERO }, format);

/**
 * The shifts of the Continue (offset) loop cycles that START inside the visible range (D4: cycle c adds c × (last −
 * first)), at most MAX_DRAWN_CYCLES and the loop's count; `more` when further cycles would start in range.
 */
export function offsetCycles(clip: Clip): { cycles: Point[]; more: boolean } {
  const list = clip.keys?.position ?? [];
  const loop = targetLoop(clip, POSITION);
  const none = { cycles: [], more: false };
  if (!loop || loop.mode !== 'offset' || list.length < 2) return none;
  const first = list[0];
  const last = list[list.length - 1];
  const period = last.t - first.t;
  const d = { x: last.x - first.x, y: last.y - first.y };
  if (!(period > 0) || (d.x === 0 && d.y === 0)) return none;
  const hi = localRange(clip)[1];
  const max = loop.count ?? Infinity;
  const cycles: Point[] = [];
  let c = 1;
  for (; c <= max && first.t + c * period < hi - EDGE; c++) {
    if (cycles.length === MAX_DRAWN_CYCLES) return { cycles, more: true };
    cycles.push({ x: c * d.x, y: c * d.y });
  }
  return { cycles, more: false };
}

/**
 * The path of `clip`'s position keys over the part of its visible local range between the first and last key (an end
 * inside the range is the key itself, an end beyond an edge is cut there). One point per frame on the clip's own frame
 * grid (so points are the frames the preview shows), every key in range exactly, sparser (whole frames) when the span
 * would need more than MAX_PATH_SAMPLES. A short curved segment gets CURVE_POINTS points so the curve reads as a curve
 * (when the key count keeps that within the budget). One key: no run, only its dot. Dots exist for visible keys only.
 */
export function sampleMotionPath(clip: Clip, fps: number, format: Size): MotionPathData {
  const list = clip.keys?.position ?? [];
  const loop = offsetCycles(clip);
  const out: MotionPathData = { runs: [], keys: [], cycles: loop.cycles, moreCycles: loop.more };
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
 * signature covers what else the result depends on: the visible range, fps, format and the position loop.
 */
export function cachedMotionPath(clip: Clip, fps: number, format: Size): MotionPathData {
  const list = clip.keys?.position;
  if (!list) return sampleMotionPath(clip, fps, format);
  const [lo, hi] = localRange(clip);
  const loop = targetLoop(clip, POSITION);
  const sig = `${lo}|${hi}|${fps}|${format.width}x${format.height}|${loop?.mode}:${loop?.count}`;
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
