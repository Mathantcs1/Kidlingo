// Offline mixdown of a project's audio, rendered in fixed windows so memory stays bounded by the window length.
import type { Clip, Id, Project } from '../core/model';
import { timelineDuration } from '../core/timeline';
import { ExportError } from '../export/errors';
import { buildClipChain } from './chain';
import { chainLatency, chainMargins } from './effects/params';
import { clipDuckPoints } from './duck';
import type { GainPoint } from './fade';
import { audibleClips, planWindow, trackVolumes } from './plan';
import type { Segment } from './plan';
import { loadSegmentAudio } from './segmentSource';
import { noteAudioBuffer, noteWindow } from './stats';

/** Seconds of audio rendered per OfflineAudioContext when exporting. */
export const EXPORT_WINDOW_SECONDS = 30;
/** Web Audio's render quantum; the pre-roll is a whole number of them so every window keeps the same block phase. */
const QUANTUM = 128;

const abortError = (): DOMException => new DOMException('Aborted', 'AbortError');
const isAbort = (e: unknown): boolean => e instanceof DOMException && e.name === 'AbortError';

export interface MixdownOptions {
  /** Window length in seconds (default EXPORT_WINDOW_SECONDS; Infinity renders one window). */
  windowSeconds?: number;
  signal?: AbortSignal;
}

/**
 * Renders a project's stereo mix window by window. Window k covers output samples [k*W, (k+1)*W) of
 * ceil(timelineDuration * sampleRate); each is rendered by its own OfflineAudioContext from only the source
 * ranges that overlap it (see planWindow), each through its clip chain (volume, fades, pan, track volume). Concatenated, the windows equal a
 * single-pass render.
 */
export class MixdownStream {
  /** Total length in sample frames. */
  readonly length: number;
  /** Sample frames rendered so far. */
  rendered = 0;
  /** Clip segments that decoded to audio so far (0 at the end means everything was silent). */
  decoded = 0;
  private readonly clips: Clip[];
  private readonly trackVolumes: Map<Id, number>;
  private readonly duckPoints: Map<Id, GainPoint[]>;
  private readonly windowLength: number;

  constructor(
    private readonly p: Project,
    readonly sampleRate: number,
    private readonly opts: MixdownOptions = {},
  ) {
    const duration = timelineDuration(p);
    this.clips = audibleClips(p);
    this.trackVolumes = trackVolumes(p);
    this.duckPoints = clipDuckPoints(p);
    this.length = duration > 0 ? Math.ceil(duration * sampleRate) : 0;
    const seconds = opts.windowSeconds ?? EXPORT_WINDOW_SECONDS;
    this.windowLength = Number.isFinite(seconds) ? Math.max(1, Math.round(seconds * sampleRate)) : this.length;
  }

  /** Whether anything in the project can make sound. */
  get audible(): boolean {
    return this.clips.length > 0 && this.length > 0;
  }

  /** Renders the next window; null once the whole length has been rendered. */
  async next(): Promise<AudioBuffer | null> {
    const from = this.rendered;
    if (from >= this.length) return null;
    const to = Math.min(this.length, from + this.windowLength);
    const t0 = from / this.sampleRate;
    const segs = planWindow(this.clips, t0, to / this.sampleRate, this.trackVolumes, this.duckPoints);
    // Effects need earlier audio (D7): the context starts `pre` frames before the window and that part is dropped.
    const preMax = Math.max(0, ...segs.map((s) => chainMargins(s.clip.audio.effects).pre));
    const pre = Math.ceil((preMax * this.sampleRate) / QUANTUM) * QUANTUM;
    const ctx = new OfflineAudioContext(2, pre + to - from, this.sampleRate);
    for (const seg of segs) {
      this.checkAbort();
      if (await this.schedule(ctx, seg, t0 - pre / this.sampleRate)) this.decoded++;
    }
    this.checkAbort();
    const rendered = await ctx.startRendering();
    this.checkAbort();
    noteAudioBuffer(rendered);
    const out = pre ? sliceBuffer(rendered, pre, rendered.length) : rendered;
    noteWindow();
    this.rendered = to;
    return out;
  }

  private checkAbort(): void {
    if (this.opts.signal?.aborted) throw abortError();
  }

  /**
   * Decodes one segment (plus cut margins and its effects' pre-roll / post-roll, never past the clip's in/out) and
   * starts it so source time srcFrom plays at timeline seg.when; `t0` is the timeline time of context time 0.
   * With effects the pre-roll plays too (the chain's seam gate keeps it silent), all of it chainLatency earlier
   * (pitch compensation) and through noise reduction first (prepareSource); false if silent.
   */
  private async schedule(ctx: OfflineAudioContext, seg: Segment, t0: number): Promise<boolean> {
    const { clip } = seg;
    const margins = chainMargins(clip.audio.effects);
    let decoded;
    try {
      decoded = await loadSegmentAudio(seg, margins, ctx, this.opts.signal);
    } catch (e) {
      if (isAbort(e) || this.opts.signal?.aborted) throw abortError();
      const name = this.p.media[seg.mediaId]?.name ?? seg.mediaId;
      throw new ExportError(`Could not read the audio of "${name}": ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!decoded) return false;
    const source = ctx.createBufferSource();
    const buffer = decoded.buffer;
    if (this.opts.signal?.aborted) throw abortError();
    source.buffer = buffer;
    // Context time 0 is timeline time t0.
    const chain = buildClipChain({ ctx, clip, trackVolume: seg.trackVolume, seg, ctxStart: -t0 });
    source.connect(chain.input);
    chain.output.connect(ctx.destination);
    // Buffer time `lead` is source time seg.srcFrom, which plays at timeline time seg.when.
    const when = seg.when - t0 - chainLatency(clip.audio.effects, ctx.sampleRate);
    const lead = seg.srcFrom - decoded.start;
    if (margins.pre > 0) {
      // Play the whole decoded history: buffer time 0 sounds at context time when - lead (clipped at 0).
      const at = when - lead;
      if (at >= 0) source.start(at);
      else source.start(0, -at);
    } else if (lead >= 0) source.start(when, lead);
    else source.start(when - lead);
    return true;
  }
}

/** Copies [from, to) sample frames of `src` into a new AudioBuffer. */
export function sliceBuffer(src: AudioBuffer, from: number, to: number): AudioBuffer {
  const out = new AudioBuffer({ length: to - from, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
  for (let c = 0; c < src.numberOfChannels; c++) out.copyToChannel(src.getChannelData(c).subarray(from, to), c);
  return out;
}

export { MixdownFeeder, renderMixdown } from './mixdownFeed';
