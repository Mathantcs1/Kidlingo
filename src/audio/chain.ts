// The one per-segment audio graph, shared by live playback (mixer.ts) and the offline mixdown (mixdown.ts).
import type { Clip } from '../core/model';
import { fadePoints, windowPoints } from './fade';
import type { GainPoint } from './fade';
import type { Segment } from './plan';

export interface ChainSpec {
  clip: Clip;
  trackVolume: number;
  /**
   * Ducking envelope in timeline time (sorted, piecewise linear). Optional override kept from the plan's
   * interface; the source of truth is `seg.duckPoints`, used when this is absent. The engines never set it.
   */
  duckPoints?: GainPoint[];
  seg: Segment;
  /** Context time of timeline time 0 of this render. */
  ctxStart: number;
  ctx: BaseAudioContext;
}

export interface ClipChain {
  /** Connect the segment's source here. */
  input: AudioNode;
  /** Connect this to the mix bus. */
  output: AudioNode;
  /** Disconnects every node of the chain. */
  dispose(): void;
}

/**
 * Schedules a timeline-time envelope on `param` (each gain × `scale`): setValueAtTime at the first point, linear
 * ramps to the rest, at context time `ctxStart + t`. Both engines go through this, so a window cut lands on the
 * same gain in live playback and in export, and (with the planned `whenEnd`) on the same time and gain on both
 * sides of the cut.
 */
export function scheduleGain(param: AudioParam, points: readonly GainPoint[], scale: number, ctxStart: number): void {
  points.forEach(({ t, gain }, i) => {
    const at = Math.max(0, ctxStart + t);
    if (i === 0) param.setValueAtTime(gain * scale, at);
    else param.linearRampToValueAtTime(gain * scale, at);
  });
}

/**
 * Balance pan law that never boosts: [left, right] gains for `pan` in [-1, 1]. The near side stays at 1 and the far
 * side tapers as cos(|pan|·π/2), reaching 0 at full pan; the centre is unity on both sides. NaN counts as centre.
 */
export function balanceGains(pan: number): [number, number] {
  const p = Number.isFinite(pan) ? Math.min(1, Math.max(-1, pan)) : 0;
  const far = Math.cos((Math.abs(p) * Math.PI) / 2);
  return p < 0 ? [1, far] : p > 0 ? [far, 1] : [1, 1];
}

/**
 * Builds the graph of one segment: input → [effects, Task 6] → clip gain (clip.volume × fade automation) →
 * balance (splitter → left / right GainNodes → merger) → track gain (trackVolume) → duck gain (automation) → output.
 *
 * The clip gain outputs exactly two channels (a mono source is duplicated to L = R), so pan 0 is unity for mono and
 * stereo alike, and panning only ever lowers the far side (see balanceGains). The two balance gains are real
 * AudioParams so pan can be automated later.
 */
export function buildClipChain(spec: ChainSpec): ClipChain {
  const { ctx, clip, seg, ctxStart } = spec;
  // The planned span itself: a window cut is the same number in both windows' segments.
  const from = seg.when;
  const to = seg.whenEnd;

  const input = ctx.createGain();
  // ---- Effects stage (Task 6) inserts here: input → effects → clipGain. ----
  const clipGain = ctx.createGain();
  clipGain.channelCount = 2;
  clipGain.channelCountMode = 'explicit';
  clipGain.channelInterpretation = 'speakers';
  scheduleGain(clipGain.gain, fadePoints(clip, from, to), clip.volume, ctxStart);

  const split = ctx.createChannelSplitter(2);
  const left = ctx.createGain();
  const right = ctx.createGain();
  const merge = ctx.createChannelMerger(2);
  [left.gain.value, right.gain.value] = balanceGains(clip.audio.pan);

  const track = ctx.createGain();
  track.gain.value = spec.trackVolume;

  const duck = ctx.createGain();
  duck.gain.value = 1;
  const duckPoints = spec.duckPoints ?? seg.duckPoints;
  if (duckPoints?.length) scheduleGain(duck.gain, windowPoints(duckPoints, from, to), 1, ctxStart);

  input.connect(clipGain).connect(split);
  split.connect(left, 0);
  split.connect(right, 1);
  left.connect(merge, 0, 0);
  right.connect(merge, 0, 1);
  merge.connect(track).connect(duck);
  const nodes: AudioNode[] = [input, clipGain, split, left, right, merge, track, duck];
  return {
    input,
    output: duck,
    dispose: () => {
      for (const n of nodes) n.disconnect();
    },
  };
}
