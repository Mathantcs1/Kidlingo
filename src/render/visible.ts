// Which clips make up the picture at a time: shared by the compositor, the preview's and the exporter's decoders.
// A frame is a list of STEPS in track order (Plan 5C D7): a plain clip, or a transition between the two clips of a cut while
// its window is open (the incoming clip is drawn from its pre-`in` handle, the outgoing one from its post-`out` handle).
import { clipEnd } from '../core/clipTime';
import { transitionValid, windowOf } from '../core/transitions';
import type { Transition } from '../core/transitionTypes';
import { activeClipsAt } from '../core/timeline';
import type { Clip, Id, Project, Track } from '../core/model';

/** Ids of every clip on a video track that is not hidden, at any time (the clips that can ever be drawn). */
export function shownClipIds(p: Project): Set<Id> {
  const shown = new Set<Id>();
  for (const track of p.tracks) {
    if (track.kind === 'video' && !track.hidden) for (const c of track.clips) shown.add(c.id);
  }
  return shown;
}

const isPicture = (c: Clip): boolean => c.kind === 'video' || c.kind === 'image' || c.kind === 'overlay' || c.kind === 'adjustment';

/** A plain clip, or a transition: `from` and `to` are both on screen, `u` is the raw progress through the window (0..1). */
export type FrameStep = { clip: Clip } | { transition: Transition; from: Clip; to: Clip; u: number };

export const isTransitionStep = (s: FrameStep): s is Extract<FrameStep, { transition: Transition }> => 'transition' in s;

/** Tolerance (s) on the window edges: n/fps against `cut ± d/2` may differ by an ulp. */
const EDGE = 1e-9;

/** The transition of `track` whose window is open at `t` (start inclusive, end exclusive), or null. Invalid ones are absent. */
function openTransition(p: Project, track: Track, t: number): { tr: Transition; from: Clip; to: Clip; ws: number } | null {
  for (const tr of track.transitions ?? []) {
    const from = track.clips.find((c) => c.id === tr.fromClipId);
    const to = track.clips.find((c) => c.id === tr.toClipId);
    if (!from || !to || !transitionValid(p, track, tr)) continue;
    const [ws, we] = windowOf(tr, to);
    if (t >= ws - EDGE && t < we - EDGE) return { tr, from, to, ws };
  }
  return null;
}

/**
 * The steps of the frame at `t`, bottom track first: video tracks that are not hidden, picture clips only. Without
 * transitions this is exactly the active clips (visualClipsAt's old result). Hidden layers are neither drawn nor decoded.
 */
export function frameStepsAt(p: Project, t: number): FrameStep[] {
  const steps: FrameStep[] = [];
  for (const track of p.tracks) {
    if (track.kind !== 'video' || track.hidden) continue;
    const open = openTransition(p, track, t);
    const active = track.clips.filter((c) => c.start <= t && t < clipEnd(c) && isPicture(c)).sort((a, b) => a.start - b.start);
    let placed = false;
    for (const clip of active) {
      if (open && (clip.id === open.from.id || clip.id === open.to.id)) {
        if (!placed) {
          steps.push({ transition: open.tr, from: open.from, to: open.to, u: Math.min(1, Math.max(0, (t - open.ws) / open.tr.duration)) });
          placed = true;
        }
        continue;
      }
      steps.push({ clip });
    }
    if (open && !placed) steps.push({ transition: open.tr, from: open.from, to: open.to, u: Math.min(1, Math.max(0, (t - open.ws) / open.tr.duration)) });
  }
  return steps;
}

/** The clips the frame needs decoded or drawn: the steps flattened (a transition contributes both its clips). */
export function visualClipsAt(p: Project, t: number): Clip[] {
  return frameStepsAt(p, t).flatMap((s) => (isTransitionStep(s) ? [s.from, s.to] : [s.clip]));
}

/** The clips actually ON the timeline at `t` (no handle clips): what the user can click on the canvas. */
export function activeVisualClipsAt(p: Project, t: number): Clip[] {
  const shown = shownClipIds(p);
  return activeClipsAt(p, t).filter((c) => shown.has(c.id) && isPicture(c));
}
