import type { Project } from '../core/model';
import { timelineDuration } from '../core/timeline';
import { buildClipChain } from './chain';
import { decodePieces, pieceTiming } from './mixerSchedule';
import type { Piece } from './mixerSchedule';
import { audibleClips, trackVolumes, windowBounds } from './plan';
import type { Mixer, MixerOptions, Session } from './mixerTypes';
import { noteLiveNodes, noteWindow } from './stats';

export { renderMixdown } from './mixdown';
export type { Mixer, MixerOptions, ScheduledPiece } from './mixerTypes';

/** Seconds of audio decoded and scheduled at a time during live playback. */
export const LIVE_WINDOW_SECONDS = 20;
/** Clock lead before the first window starts, so every node of it starts on the same tick (> pitch.ts LIVE_LEAD). */
const START_LEAD = 0.05;
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
    let first: Piece[] = [];
    try {
      if (s.windows.length) first = await decodePieces(s, s.windows[0], false, () => gen === this.generation);
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
        const pieces = await decodePieces(s, s.windows[s.next], true, () => s.gen === this.generation);
        if (s.gen !== this.generation) return;
        this.scheduleWindow(s, pieces);
      }
    } catch (e) {
      if (s.gen !== this.generation) return;
      if (this.opts.onError) this.opts.onError(e);
      else console.error('clipforge: playback audio failed', e);
    }
  }

  private scheduleWindow(s: Session, pieces: Piece[]): void {
    s.next++;
    noteWindow();
    for (const piece of pieces) this.schedule(s, piece);
  }

  /** Plays one piece through its clip chain at the clock time pieceTiming gives (see mixerSchedule.ts). */
  private schedule(s: Session, piece: Piece): void {
    const { ctx } = s;
    const { seg, decoded } = piece;
    const { start, end, when, offset, duration, late } = pieceTiming(s, piece, ctx.currentTime);
    this.opts.onSchedule?.({ clipId: seg.clipId, srcFrom: seg.srcFrom, srcTo: seg.srcTo, start, end, late });
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
