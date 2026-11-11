// The one per-segment audio graph, shared by live playback (mixer.ts) and the offline mixdown (mixdown.ts).
import type { Clip } from '../core/model';
import { fadePoints, windowPoints } from './fade';
import type { GainPoint } from './fade';
import type { Segment } from './plan';

export interface ChainSpec {
  clip: Clip;
  trackVolume: number;
  /** Ducking envelope in timeline time (piecewise linear, sorted); none means unity. */
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
 * same gain in live playback and in export.
 */
export function scheduleGain(param: AudioParam, points: readonly GainPoint[], scale: number, ctxStart: number): void {
  points.forEach(({ t, gain }, i) => {
    const at = Math.max(0, ctxStart + t);
    if (i === 0) param.setValueAtTime(gain * scale, at);
    else param.linearRampToValueAtTime(gain * scale, at);
  });
}

const clampPan = (pan: number): number => (Number.isFinite(pan) ? Math.min(1, Math.max(-1, pan)) : 0);

/**
 * Builds the graph of one segment: input → [effects, Task 6] → clip gain (clip.volume × fade automation) →
 * StereoPannerNode (pan) → track gain (trackVolume) → duck gain (automation) → output.
 *
 * The panner takes exactly two channels (mono sources are up-mixed to L = R first), so pan 0 leaves mono and
 * stereo sources at unity; Web Audio's stereo pan law then folds the far channel into the near one.
 */
export function buildClipChain(spec: ChainSpec): ClipChain {
  const { ctx, clip, seg, ctxStart } = spec;
  const from = seg.when;
  const to = seg.when + (seg.srcTo - seg.srcFrom);

  const input = ctx.createGain();
  // ---- Effects stage (Task 6) inserts here: input → effects → clipGain. ----
  const clipGain = ctx.createGain();
  scheduleGain(clipGain.gain, fadePoints(clip, from, to), clip.volume, ctxStart);

  const panner = ctx.createStereoPanner();
  panner.channelCount = 2;
  panner.channelCountMode = 'explicit';
  panner.channelInterpretation = 'speakers';
  panner.pan.value = clampPan(clip.audio.pan);

  const track = ctx.createGain();
  track.gain.value = spec.trackVolume;

  const duck = ctx.createGain();
  duck.gain.value = 1;
  if (spec.duckPoints?.length) scheduleGain(duck.gain, windowPoints(spec.duckPoints, from, to), 1, ctxStart);

  input.connect(clipGain).connect(panner).connect(track).connect(duck);
  const nodes: AudioNode[] = [input, clipGain, panner, track, duck];
  return {
    input,
    output: duck,
    dispose: () => {
      for (const n of nodes) n.disconnect();
    },
  };
}
