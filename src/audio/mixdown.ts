// Offline mixdown of a project's audio, rendered in fixed windows so memory stays bounded by the window length.
import type { Clip, Id, Project } from '../core/model';
import { timelineDuration } from '../core/timeline';
import { ExportError } from '../export/errors';
import { decodeAudioRange } from '../media/audioDecode';
import { buildClipChain } from './chain';
import { audibleClips, planWindow, trackVolumes } from './plan';
import type { Segment } from './plan';
import { noteAudioBuffer, noteWindow } from './stats';

/** Seconds of audio rendered per OfflineAudioContext when exporting. */
export const EXPORT_WINDOW_SECONDS = 30;
/**
 * Seconds of real neighbouring source audio decoded on each side of a window cut (never past the clip's own
 * in/out), so resampling at the cut sees the same samples as an uncut render and windows join seamlessly.
 */
const CUT_MARGIN = 0.05;

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
  private readonly windowLength: number;

  constructor(
    private readonly p: Project,
    readonly sampleRate: number,
    private readonly opts: MixdownOptions = {},
  ) {
    const duration = timelineDuration(p);
    this.clips = audibleClips(p);
    this.trackVolumes = trackVolumes(p);
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
    const ctx = new OfflineAudioContext(2, to - from, this.sampleRate);
    for (const seg of planWindow(this.clips, t0, to / this.sampleRate, this.trackVolumes)) {
      this.checkAbort();
      if (await this.schedule(ctx, seg, t0)) this.decoded++;
    }
    this.checkAbort();
    const out = await ctx.startRendering();
    this.checkAbort();
    noteAudioBuffer(out);
    noteWindow();
    this.rendered = to;
    return out;
  }

  private checkAbort(): void {
    if (this.opts.signal?.aborted) throw abortError();
  }

  /** Decodes one segment (plus cut margins) and starts it at its window-relative time; false if silent. */
  private async schedule(ctx: OfflineAudioContext, seg: Segment, t0: number): Promise<boolean> {
    const { clip } = seg;
    const from = Math.max(clip.in, seg.srcFrom - CUT_MARGIN);
    const to = Math.min(clip.out, seg.srcTo + CUT_MARGIN);
    let decoded;
    try {
      decoded = await decodeAudioRange(seg.mediaId, from, to, ctx, this.opts.signal);
    } catch (e) {
      if (isAbort(e) || this.opts.signal?.aborted) throw abortError();
      const name = this.p.media[seg.mediaId]?.name ?? seg.mediaId;
      throw new ExportError(`Could not read the audio of "${name}": ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!decoded) return false;
    const source = ctx.createBufferSource();
    source.buffer = decoded.buffer;
    // Context time 0 is timeline time t0.
    const chain = buildClipChain({ ctx, clip, trackVolume: seg.trackVolume, seg, ctxStart: -t0 });
    source.connect(chain.input);
    chain.output.connect(ctx.destination);
    // Buffer time `lead` is source time seg.srcFrom, which plays at timeline time seg.when.
    const when = seg.when - t0;
    const lead = seg.srcFrom - decoded.start;
    if (lead >= 0) source.start(when, lead);
    else source.start(when - lead);
    return true;
  }
}

/**
 * Renders the project's audio to one stereo AudioBuffer covering [0, timelineDuration(p)), built from
 * MixdownStream windows. Each audible clip's [in, out) source range is decoded at the media's native rate (the
 * context resamples), placed at `clip.start` and played through its clip chain (see chain.ts). Returns null if nothing is audible.
 */
export async function renderMixdown(
  p: Project,
  sampleRate = 48000,
  opts: MixdownOptions = {},
): Promise<AudioBuffer | null> {
  const stream = new MixdownStream(p, sampleRate, opts);
  if (!stream.audible) return null;
  const out = new AudioBuffer({ length: stream.length, numberOfChannels: 2, sampleRate });
  for (let at = 0, w = await stream.next(); w; at += w.length, w = await stream.next()) {
    for (let c = 0; c < 2; c++) out.copyToChannel(w.getChannelData(c), c, at);
  }
  return stream.decoded > 0 ? out : null;
}

/** Copies [from, to) sample frames of `src` into a new AudioBuffer. */
function sliceBuffer(src: AudioBuffer, from: number, to: number): AudioBuffer {
  const out = new AudioBuffer({ length: to - from, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
  for (let c = 0; c < src.numberOfChannels; c++) out.copyToChannel(src.getChannelData(c).subarray(from, to), c);
  return out;
}

/**
 * Hands a MixdownStream to an encoder in slices of `slice` sample frames, rendering the next window only when
 * the previous one has been handed out, so at most one window is held at a time.
 */
export class MixdownFeeder {
  /** Sample frames handed out so far. */
  fed = 0;
  private window: AudioBuffer | null = null;
  private pos = 0;

  constructor(
    readonly stream: MixdownStream,
    private readonly slice: number,
  ) {}

  /** Hands out audio up to `seconds` (clamped to the mix length) through `add`. */
  async feedUntil(seconds: number, add: (b: AudioBuffer) => Promise<void>): Promise<void> {
    const end = Math.min(this.stream.length, Math.ceil(seconds * this.stream.sampleRate));
    while (this.fed < end) {
      if (!this.window || this.pos >= this.window.length) {
        this.window = await this.stream.next();
        this.pos = 0;
        if (!this.window) return;
      }
      const n = Math.min(this.slice, this.window.length - this.pos, end - this.fed);
      await add(sliceBuffer(this.window, this.pos, this.pos + n));
      this.pos += n;
      this.fed += n;
    }
    if (this.window && this.pos >= this.window.length) this.window = null;
  }
}
