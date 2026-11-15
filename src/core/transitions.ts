// Pure geometry and validity of transitions (Plan 5C D2-D5): cuts, windows, handles through the 5D time map, the longest
// duration a cut allows and the ONE validity predicate. No edits here (transitionEdits.ts, transitionReconcile.ts).
import { clipDuration, clipEnd, hasOwnTimeline, timelineTimeAt } from './clipTime';
import type { Clip, MediaRef, Project, Track } from './model';
import { MAX_TRANSITION_SECONDS, MIN_TRANSITION_FRAMES, TRANSITION_EASES } from './transitionTypes';
import type { Transition } from './transitionTypes';

const EPS = 1e-9;

/** Consecutive clips of `track` that touch (the end of one is the start of the next): the places a transition can sit. */
export function cutsOf(track: Track): { from: Clip; to: Clip; time: number }[] {
  const sorted = [...track.clips].sort((a, b) => a.start - b.start);
  const out: { from: Clip; to: Clip; time: number }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1];
    const to = sorted[i];
    if (Math.abs(clipEnd(from) - to.start) <= EPS) out.push({ from, to, time: to.start });
  }
  return out;
}

/** The transition's window [start, end) in timeline seconds, centred on the cut (the incoming clip's start). */
export function windowOf(tr: Transition, to: Clip): [number, number] {
  return [to.start - tr.duration / 2, to.start + tr.duration / 2];
}

/** Whole even frames, rounded DOWN (a frame-aligned cut then has frame-aligned window edges, D4). */
export function snapDuration(seconds: number, fps: number): number {
  if (!(seconds > 0) || !Number.isFinite(seconds)) return 0;
  const n = Math.floor(seconds * fps + 1e-6);
  return (n - (n % 2)) / fps;
}

/**
 * Timeline seconds the clip can be drawn BEFORE its start / AFTER its end with the footage staying inside the file (D3),
 * at the speed the 5D map holds there. Stills, overlays and freeze frames have no limit; missing media has none.
 */
function handle(clip: Clip, media: MediaRef | undefined, side: 'before' | 'after'): number {
  if (clip.kind === 'overlay' || clip.kind === 'image' || hasOwnTimeline(clip)) return Infinity;
  if (clip.kind === 'adjustment' || !media || media.missing) return 0;
  if (!(media.duration > 0)) return Infinity;
  const reverse = clip.reverse === true;
  const limit = side === 'before' ? (reverse ? media.duration : 0) : reverse ? 0 : media.duration;
  const at = timelineTimeAt(clip, limit);
  return Math.max(0, side === 'before' ? clip.start - at : at - clipEnd(clip));
}

export const handleBefore = (clip: Clip, media: MediaRef | undefined): number => handle(clip, media, 'before');
export const handleAfter = (clip: Clip, media: MediaRef | undefined): number => handle(clip, media, 'after');

const isPicture = (c: Clip): boolean => c.kind === 'video' || c.kind === 'image' || c.kind === 'overlay';

/** Whether the transition may sit between these two clips on a track of this kind (kinds only, no timing). */
export function pairAllowed(track: Track, tr: Pick<Transition, 'type'>, from: Clip | undefined, to: Clip | undefined): boolean {
  if (!from || !to) return false;
  if (track.kind === 'audio') return tr.type === 'audio' && from.kind === 'audio' && to.kind === 'audio';
  return tr.type !== 'audio' && isPicture(from) && isPicture(to);
}

/**
 * The longest duration the cut allows (D2/D3/D4): twice the smaller handle, at most MAX seconds, and small enough that
 * each clip still holds both of its half-windows (`otherIn`: duration of the transition on `from`'s start side, `otherOut`:
 * on `to`'s end side, 0 when none). Rounded down to whole even frames.
 */
export function maxDuration(p: Project, from: Clip, to: Clip, other: { fromIn?: number; toOut?: number } = {}): number {
  const fps = p.format.fps;
  const byHandle = 2 * Math.min(handleAfter(from, p.media[from.mediaId]), handleBefore(to, p.media[to.mediaId]));
  const byFrom = 2 * clipDuration(from) - (other.fromIn ?? 0);
  const byTo = 2 * clipDuration(to) - (other.toOut ?? 0);
  return snapDuration(Math.min(MAX_TRANSITION_SECONDS, byHandle, byFrom, byTo), fps);
}

/** A transition's ease is one of the allowed kinds (bezier y values within [0, 1]). */
export function easeAllowed(tr: Pick<Transition, 'ease'>): boolean {
  const e = tr.ease;
  if (!TRANSITION_EASES.includes(e.kind)) return false;
  return e.kind !== 'bezier' || (e.bezier !== undefined && e.bezier[1] >= 0 && e.bezier[1] <= 1 && e.bezier[3] >= 0 && e.bezier[3] <= 1);
}

/**
 * D2, for ONE transition of `track` given the track's other transitions (`all`): both clips exist here and touch, the kinds
 * fit, the duration is a whole even number of frames between the minimum and the handles/clip lengths allow, at most one
 * transition per cut, the ease is allowed. Render and audio treat an invalid transition as absent.
 */
export function transitionValid(p: Project, track: Track, tr: Transition, all: readonly Transition[] = track.transitions ?? []): boolean {
  const from = track.clips.find((c) => c.id === tr.fromClipId);
  const to = track.clips.find((c) => c.id === tr.toClipId);
  if (!pairAllowed(track, tr, from, to) || !from || !to) return false;
  if (Math.abs(clipEnd(from) - to.start) > EPS || !easeAllowed(tr)) return false;
  const fps = p.format.fps;
  const d = tr.duration;
  if (!Number.isFinite(d) || d < MIN_TRANSITION_FRAMES / fps - EPS) return false;
  const frames = d * fps;
  if (Math.abs(frames - Math.round(frames)) > 1e-6 || Math.round(frames) % 2 !== 0) return false;
  const others = all.filter((o) => o !== tr && o.id !== tr.id);
  if (others.some((o) => o.fromClipId === tr.fromClipId && o.toClipId === tr.toClipId)) return false;
  const fromIn = others.find((o) => o.toClipId === from.id)?.duration;
  const toOut = others.find((o) => o.fromClipId === to.id)?.duration;
  return d <= maxDuration(p, from, to, { fromIn, toOut }) + 1e-6;
}
