import type { Clip, Id, Project } from '../core/model';
import { timelineDuration } from '../core/timeline';
import { decodeAudioRange } from '../media/audioDecode';
import type { DecodedAudio } from '../media/audioDecode';
import { audibleClips, planWindow, windowBounds } from './plan';
import type { Segment } from './plan';
import type { Mixer, MixerOptions } from './mixerTypes';
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

interface Session {
  gen: number;
  ctx: AudioContext;
  from: number;
  ctxStart: number;
  clips: Clip[];
  byId: Map<Id, Clip>;
  windows: [number, number][];
  next: number;
  names: Map<Id, string>;
  master: GainNode | null;
  /** Scheduled source nodes and their gain nodes, dropped as they end. */
  nodes: Map<AudioBufferSourceNode, GainNode>;
  timer: ReturnType<typeof setTimeout> | undefined;
  wake: (() => void) | null;
}

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
      ctx,
      from,
      ctxStart: 0,
      clips,
      byId: new Map(clips.map((c) => [c.id, c])),
      windows: windowBounds(from, timelineDuration(p), this.window),
      next: 0,
      names: new Map(Object.values(p.media).map((m) => [m.id, m.name])),
      master: null,
      nodes: new Map(),
      timer: undefined,
      wake: null,
    };
    this.session = s;
    const first = s.windows.length ? await this.decodeWindow(s, s.windows[0]) : [];
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
    for (const seg of planWindow(s.clips, a, b)) {
      const clip = s.byId.get(seg.clipId)!;
      let decoded: DecodedAudio | null;
      try {
        const from = Math.max(clip.in, seg.srcFrom - CUT_MARGIN);
        decoded = await decodeAudioRange(seg.mediaId, from, Math.min(clip.out, seg.srcTo + CUT_MARGIN), s.ctx);
      } catch (e) {
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

  /** Plays source [srcFrom, srcTo) of the decoded buffer at its exact clock time (sub-sample offsets). */
  private schedule(s: Session, seg: Segment, decoded: DecodedAudio): void {
    const { ctx } = s;
    const start = s.ctxStart + (seg.when - s.from);
    const end = start + (seg.srcTo - seg.srcFrom);
    // Buffer time of srcFrom / srcTo (decoded.start is within half a sample of the requested start).
    const lead = seg.srcFrom - decoded.start;
    let offset = Math.max(0, lead);
    let when = start + (offset - lead);
    const late = Math.max(0, ctx.currentTime - when);
    when += late;
    offset += late;
    const duration = lead + (seg.srcTo - seg.srcFrom) - offset;
    this.opts.onSchedule?.({ clipId: seg.clipId, srcFrom: seg.srcFrom, srcTo: seg.srcTo, start, end, late });
    if (!(duration > 0) || !s.master) return;
    const node = ctx.createBufferSource();
    node.buffer = decoded.buffer;
    const gain = ctx.createGain();
    gain.gain.value = seg.volume;
    node.connect(gain).connect(s.master);
    node.onended = () => this.release(s, node, false);
    node.start(when, offset, duration);
    s.nodes.set(node, gain);
    noteLiveNodes(1);
  }

  /** Disconnects a node (stopping it first when cut short) and forgets it. */
  private release(s: Session, node: AudioBufferSourceNode, stop: boolean): void {
    const gain = s.nodes.get(node);
    if (!gain) return;
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
    gain.disconnect();
    noteLiveNodes(-1);
  }
}

/** A live mixer; pass the shared AudioContext (see audio/context) so it is unlocked in the Play gesture. */
export function createMixer(opts: MixerOptions = {}): Mixer {
  return new LiveMixer(opts);
}
