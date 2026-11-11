// The one per-segment audio graph, shared by live playback (mixer.ts) and the offline mixdown (mixdown.ts).
import { clipEnd } from '../core/model';
import type { Clip } from '../core/model';
import type { DecodedAudio } from '../media/audioDecode';
import { denoiseBuffer } from './denoise';
import { clampParams, hasTail } from './effects/params';
import { buildEffects } from './effects/registry';
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
 * Window-seam gate (D7) after the effects: 0 before timeline `from`, 1 over [from, to), 0 from `to` on. The
 * engines feed a chain with effects some extra earlier source audio (chainMargins pre-roll) so stateful effects
 * (filters, compressor, reverb, echo) enter the segment in the state an uncut render would have; the gate keeps
 * that pre-roll, and every tail past the segment end, silent. Adjacent segments switch at the same number, so
 * back-to-back windows sum to the uncut output. Tails never sound past the clip end (live and export). When the
 * chain has a tail effect (hasTail: reverb, echo) the gate closes there with a short linear ramp (TAIL_RAMP), so a
 * still-ringing tail does not click; a split of such a clip dips ~8 ms at the join and restarts the effect cold.
 * Every other chain keeps the hard step at the clip end, so dry audio stays continuous across splits and joins.
 * Window cuts always keep the exact step; the ramp belongs to the clip's own end, the same in every render.
 */
function gate(ctx: BaseAudioContext, clip: Clip, from: number, to: number, ctxStart: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = 0;
  // The clip-end ramp is a property of the clip, not of the segment: a window cut inside it lands on the same line.
  const end = clipEnd(clip);
  const r = hasTail(clip.audio.effects) ? Math.min(TAIL_RAMP, Math.max(0, end - clip.start)) : 0;
  const points = r > 0 ? windowPoints([{ t: end - r, gain: 1 }, { t: end, gain: 0 }], from, to) : [{ t: from, gain: 1 }];
  // Every gate event on a whole frame; the close shares its time with a ramp ending at `to` and follows it.
  points.forEach(({ t, gain }, i) => {
    if (i === 0) g.gain.setValueAtTime(gain, frameTime(ctx, ctxStart + t));
    else g.gain.linearRampToValueAtTime(gain, frameTime(ctx, ctxStart + t));
  });
  g.gain.setValueAtTime(0, frameTime(ctx, ctxStart + to));
  return g;
}

/**
 * Context time `t` snapped to its nearest frame, a hair before it: an event lands on that frame whether the engine
 * rounds or ceils (ctxStart + from is not exact in binary, e.g. (0.2 - 2.8) + 3, and ceil would open the gate one
 * frame late in one window and not in another).
 */
function frameTime(ctx: BaseAudioContext, t: number): number {
  return Math.max(0, (Math.round(t * ctx.sampleRate) - 1e-3) / ctx.sampleRate);
}

/** Seconds over which effects (dry and wet) fade out at a clip's end. */
export const TAIL_RAMP = 0.008;

/**
 * Builds the graph of one segment: input → [enabled effects → seam gate] → clip gain (clip.volume × fade automation) →
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
  const effects = buildEffects(ctx, clip.audio.effects, { phase0: ctxStart + clip.start, end: ctxStart + to });
  const seam = effects ? gate(ctx, clip, from, to, ctxStart) : null;
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

  if (effects && seam) {
    input.connect(effects.input);
    effects.output.connect(seam).connect(clipGain);
  } else {
    input.connect(clipGain);
  }
  clipGain.connect(split);
  split.connect(left, 0);
  split.connect(right, 1);
  left.connect(merge, 0, 0);
  right.connect(merge, 0, 1);
  merge.connect(track).connect(duck);
  const nodes: AudioNode[] = [input, ...(effects?.all ?? []), ...(seam ? [seam] : []), clipGain, split, left, right, merge, track, duck];
  return {
    input,
    output: duck,
    dispose: () => {
      for (const n of nodes) {
        // Looping control sources (pitch) would otherwise run on until their scheduled stop.
        const source = n as Partial<AudioScheduledSourceNode>;
        if (typeof source.stop === 'function') {
          try {
            source.stop();
          } catch {
            // Never started.
          }
        }
        n.disconnect();
      }
    },
  };
}

/**
 * The buffer a segment's source plays: the decoded audio after every enabled noise-reduction effect (D4), which
 * works offline on the whole decoded piece (margins included) BEFORE the node graph, wherever it sits in the
 * list. Its STFT frames sit on the source's own sample grid, so overlapping pieces share them (window seams).
 */
export function prepareSource(clip: Clip, decoded: DecodedAudio): AudioBuffer {
  let buffer = decoded.buffer;
  const origin = Math.round(decoded.start * buffer.sampleRate);
  for (const e of clip.audio.effects) {
    if (e.enabled && e.type === 'denoise') buffer = denoiseBuffer(buffer, clampParams('denoise', e.params).strength, origin);
  }
  return buffer;
}
