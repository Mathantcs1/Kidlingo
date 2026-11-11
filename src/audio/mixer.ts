import type { Project } from '../core/model';
import { timelineDuration } from '../core/timeline';
import { decodeAudioRange } from '../media/audioDecode';
import type { DecodedAudio } from '../media/audioDecode';
import { buildClipChain } from './chain';
import { chainMargins } from './effects/params';
import { audibleClips, planWindow, trackVolumes, windowBounds } from './plan';
import type { Segment } from './plan';
import type { Mixer, MixerOptions, Session } from './mixerTypes';
import { noteLiveNodes, noteWindow } from './stats';

export { renderMixdown } from './mixdown';
export type { Mixer, MixerOptions, ScheduledPiece } from './mixerTypes';

/** Seconds of audio decoded and scheduled at a time during live playback. */
export const LIVE_WINDOW_SECONDS = 20;
/** Clock lead before the first window starts, so every node of it starts on the same tick. */
const START_LEAD = 0.05;
/** Real source audio decoded past each window cut, so resampling at the cut sees its true neighbours. */
const CUT_MARGIN = 0.05;
/** Shortest wait between checks of whether the next window is due. */
const MIN_WAIT_MS = 50;

class LiveMixer implements Mixer {
  private session: Session | null = null;
  private origin = 0;
  private playing = false;
  /** Bumped on every play/stop so superseded work never schedules audio. */
  private generation = 0;
  private own: AudioContext | null = null;
  private readonly window: number;

  constructor(private readonly opts: MixerOptions = {}) {
    this.window = opts.windowSeconds ?? LIVE_WINDOW_SECONDS;
  }

  private context(): AudioContext {
    const c = this.opts.context;
    if (typeof c === 'function') return c();
    if (c) return c;
    this.own ??= new AudioContext();
    return this.own;
  }

  async play(p: Project, from: number): Promise<void> {
    this.stop();
    const gen = ++this.generation;
    const ctx = this.context();
    // Resume without awaiting: without a user gesture the promise may not settle until one happens.
    void ctx.resume().catch(() => undefined);
    this.origin = from;
    const clips = audibleClips(p);
    const s: Session = {
      gen,
      abort: new AbortController(),
      ctx,
      from,
      ctxStart: 0,
      clips,
      trackVolumes: trackVolumes(p),
      windows: windowBounds(from, timelineDuration(p), this.window),
      next: 0,
      names: new Map(Object.values(p.media).map((m) => [m.id, m.name])),
      master: null,
      nodes: new Map(),
      timer: undefined,
      wake: null,
    };
    this.session = s;
    let first: [Segment, DecodedAudio][] = [];
    try {
      if (s.windows.length) first = await this.decodeWindow(s, s.windows[0]);
    } catch (e) {
      if (gen !== this.generation) return;
      throw e;
    }
    if (gen !== this.generation) return;
    s.master = ctx.createGain();
    s.master.connect(ctx.destination);
    s.ctxStart = ctx.currentTime + START_LEAD;
    this.scheduleWindow(s, first);
    this.playing = true;
    void this.pump(s);
  }

  stop(): void {
    this.generation++;
    if (this.playing) this.origin = this.currentTime();
    this.playing = false;
    const s = this.session;
    this.session = null;
    if (!s) return;
    clearTimeout(s.timer);
    s.wake?.();
    s.abort.abort();
    for (const node of [...s.nodes.keys()]) this.release(s, node, true);
    s.master?.disconnect();
  }

  currentTime(): number {
    const s = this.session;
    if (!s || !this.playing) return this.origin;
    return this.origin + Math.max(0, s.ctx.currentTime - s.ctxStart);
  }

  debugClockStart(): number {
    return this.session?.ctxStart ?? 0;
  }

  /** Decodes and schedules each later window once playback is within one window of the decoded edge. */
  private async pump(s: Session): Promise<void> {
    try {
      while (s.gen === this.generation && s.next < s.windows.length) {
        const lead = s.windows[s.next][0] - this.currentTime();
        if (lead > this.window) {
          await new Promise<void>((resolve) => {
            s.wake = resolve;
            s.timer = setTimeout(resolve, Math.max(MIN_WAIT_MS, (lead - this.window) * 1000));
          });
          continue;
        }
        const pieces = await this.decodeWindow(s, s.windows[s.next]);
        if (s.gen !== this.generation) return;
        this.scheduleWindow(s, pieces);
      }
    } catch (e) {
      if (s.gen !== this.generation) return;
      if (this.opts.onError) this.opts.onError(e);
      else console.error('clipforge: playback audio failed', e);
    }
  }

  /** Decodes the window's segments (plus cut margins); stops early once superseded. */
  private async decodeWindow(s: Session, [a, b]: [number, number]): Promise<[Segment, DecodedAudio][]> {
    const out: [Segment, DecodedAudio][] = [];
    for (const seg of planWindow(s.clips, a, b, s.trackVolumes)) {
      const { clip } = seg;
      let decoded: DecodedAudio | null;
      try {
        const m = chainMargins(clip.audio.effects);
        const from = Math.max(clip.in, seg.srcFrom - CUT_MARGIN - m.pre);
        const to = Math.min(clip.out, seg.srcTo + CUT_MARGIN + m.post);
        decoded = await decodeAudioRange(seg.mediaId, from, to, s.ctx, s.abort.signal);
      } catch (e) {
        if (s.gen !== this.generation) return [];
        const name = s.names.get(seg.mediaId) ?? seg.mediaId;
        throw new Error(`Could not read the audio of "${name}": ${e instanceof Error ? e.message : String(e)}`);
      }
      if (s.gen !== this.generation) return [];
      if (decoded) out.push([seg, decoded]);
    }
    return out;
  }

  private scheduleWindow(s: Session, pieces: [Segment, DecodedAudio][]): void {
    s.next++;
    noteWindow();
    for (const [seg, decoded] of pieces) this.schedule(s, seg, decoded);
  }

  /**
   * Plays source [srcFrom, srcTo) of the decoded buffer at its exact clock time (sub-sample offsets). A clip with
   * effects also plays its pre-roll before and post-roll after (D7; the chain's seam gate silences both) so its
   * effects enter the segment warmed up. Pre-roll that is already in the past (the first window after Play) is
   * skipped: effects then start cold at the play position, exactly like a clip that begins there.
   */
  private schedule(s: Session, seg: Segment, decoded: DecodedAudio): void {
    const { ctx } = s;
    const start = s.ctxStart + (seg.when - s.from);
    const end = start + (seg.srcTo - seg.srcFrom);
    const m = chainMargins(seg.clip.audio.effects);
    // Buffer time of srcFrom / srcTo (decoded.start is within half a sample of the requested start).
    const lead = seg.srcFrom - decoded.start;
    // Seconds played before srcFrom: all decoded pre-roll with effects (negative if the buffer starts after srcFrom).
    const roll = lead < 0 || m.pre > 0 ? lead : 0;
    let offset = lead - roll;
    let when = start - roll;
    const late = Math.max(0, ctx.currentTime - when);
    when += late;
    offset += late;
    const duration = lead + (seg.srcTo - seg.srcFrom) + m.post - offset;
    const segLate = Math.max(0, late - Math.max(0, roll));
    this.opts.onSchedule?.({ clipId: seg.clipId, srcFrom: seg.srcFrom, srcTo: seg.srcTo, start, end, late: segLate });
    if (!(duration > 0) || !s.master) return;
    const node = ctx.createBufferSource();
    node.buffer = decoded.buffer;
    // Timeline time t plays at context time s.ctxStart + (t - s.from).
    const chain = buildClipChain({ ctx, clip: seg.clip, trackVolume: seg.trackVolume, seg, ctxStart: s.ctxStart - s.from });
    node.connect(chain.input);
    chain.output.connect(s.master);
    node.onended = () => this.release(s, node, false);
    node.start(when, offset, duration);
    s.nodes.set(node, chain);
    noteLiveNodes(1);
  }

  /** Disconnects a node (stopping it first when cut short) and forgets it. */
  private release(s: Session, node: AudioBufferSourceNode, stop: boolean): void {
    const chain = s.nodes.get(node);
    if (!chain) return;
    s.nodes.delete(node);
    node.onended = null;
    if (stop) {
      try {
        node.stop();
      } catch {
        // Never started.
      }
    }
    node.disconnect();
    chain.dispose();
    noteLiveNodes(-1);
  }
}

/** A live mixer; pass the shared AudioContext (see audio/context) so it is unlocked in the Play gesture. */
export function createMixer(opts: MixerOptions = {}): Mixer {
  return new LiveMixer(opts);
}
