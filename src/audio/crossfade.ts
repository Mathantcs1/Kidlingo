// Audio crossfades on transitioned cuts (Plan 5C D12): for every valid transition whose two clips can both sound, each clip
// plays on into / from its handle and gets a gain envelope over the transition window. Equal power by default
// (gOut = cos(e·π/2), gIn = sin(e·π/2)), or constant gain (1 − e, e); e is the transition's own eased progress. The envelope
// is a breakpoint list in timeline time (33 points, 32 linear segments: the equal-power chord error is below 3.1e-4), the same
// numbers in every window. Pure and DOM-free.
import { easeAt } from '../core/easing';
import { clipEnd } from '../core/clipTime';
import type { Clip, Id, Project } from '../core/model';
import { transitionValid, windowOf } from '../core/transitions';
import type { Transition } from '../core/transitionTypes';
import type { GainPoint } from './fade';

/** Segments per envelope (points = SEGMENTS + 1). */
export const XFADE_SEGMENTS = 32;

/** What a clip's audio does beyond its own span because of the transitions on its two sides. */
export interface ClipCrossfade {
  /** Seconds the clip sounds before its start (the half-window of a transition INTO it), 0 when none. */
  before: number;
  /** Seconds the clip sounds after its end (the half-window of a transition OUT of it), 0 when none. */
  after: number;
  /** The incoming clip's gain over its window (0 → 1), timeline time. */
  inPoints?: GainPoint[];
  /** The outgoing clip's gain over its window (1 → 0), timeline time. */
  outPoints?: GainPoint[];
}

/** The two envelopes of `tr` over its window [w0, w1]: [outgoing, incoming]. */
export function crossfadeEnvelopes(tr: Transition, w0: number): [GainPoint[], GainPoint[]] {
  const out: GainPoint[] = [];
  const inn: GainPoint[] = [];
  const power = (tr.audio ?? 'power') === 'power';
  for (let k = 0; k <= XFADE_SEGMENTS; k++) {
    const t = w0 + (tr.duration * k) / XFADE_SEGMENTS;
    const e = easeAt(tr.ease, k / XFADE_SEGMENTS, tr.duration);
    // Exact end values (cos(π/2) is 6e-17): the incoming clip reaches 1 and the outgoing exactly 0.
    out.push({ t, gain: k === 0 ? 1 : k === XFADE_SEGMENTS ? 0 : power ? Math.cos((e * Math.PI) / 2) : 1 - e });
    inn.push({ t, gain: k === 0 ? 0 : k === XFADE_SEGMENTS ? 1 : power ? Math.sin((e * Math.PI) / 2) : e });
  }
  return [out, inn];
}

/**
 * Clip id → its crossfade, for the clips of `audible` that take part in a valid transition whose OTHER clip is audible too
 * (a detached or muted partner leaves the transition silent on the sound side: each clip then keeps its own fades).
 */
export function crossfadeInfo(p: Project, audible: readonly Clip[]): Map<Id, ClipCrossfade> {
  const ids = new Set(audible.map((c) => c.id));
  const out = new Map<Id, ClipCrossfade>();
  for (const track of p.tracks) {
    for (const tr of track.transitions ?? []) {
      if (!ids.has(tr.fromClipId) || !ids.has(tr.toClipId) || !transitionValid(p, track, tr)) continue;
      const from = track.clips.find((c) => c.id === tr.fromClipId)!;
      const to = track.clips.find((c) => c.id === tr.toClipId)!;
      const [w0] = windowOf(tr, to);
      const [outPoints, inPoints] = crossfadeEnvelopes(tr, w0);
      out.set(from.id, { ...out.get(from.id), before: out.get(from.id)?.before ?? 0, after: tr.duration / 2, outPoints });
      out.set(to.id, { ...out.get(to.id), after: out.get(to.id)?.after ?? 0, before: tr.duration / 2, inPoints });
    }
  }
  return out;
}

/** The span [start, end] a clip's sound occupies on the timeline including its crossfade halves. */
export function audibleSpanOf(clip: Clip, xf: ClipCrossfade | undefined): [number, number] {
  return [clip.start - (xf?.before ?? 0), clipEnd(clip) + (xf?.after ?? 0)];
}
