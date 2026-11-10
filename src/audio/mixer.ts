import { clipEnd } from '../core/model';
import { audibleClips } from './plan';
import type { Clip, Project } from '../core/model';
import { decodeAudio } from '../media/decode';

/** Live playback of a project's audio through an AudioContext. */
export interface Mixer {
  /**
   * Stops any current playback, decodes the audible clips and schedules them from timeline time `from`
   * (seconds). Resolves once playback has been scheduled.
   */
  play(p: Project, from: number): Promise<void>;
  /** Stops playback and releases the graph. Idempotent. */
  stop(): void;
  /** Timeline seconds of the playhead, derived from the AudioContext clock; 0 before the first play. */
  currentTime(): number;
}

/** Connects `buffer` through a gain of `clip.volume` to `dest`; the caller starts the returned node. */
function connectClip(ctx: BaseAudioContext, buffer: AudioBuffer, clip: Clip, dest: AudioNode): AudioBufferSourceNode {
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const gain = ctx.createGain();
  gain.gain.value = clip.volume;
  source.connect(gain).connect(dest);
  return source;
}

export { renderMixdown } from './mixdown';

class LiveMixer implements Mixer {
  private ctx: AudioContext | null = null;
  private nodes: AudioBufferSourceNode[] = [];
  /** AudioContext time that corresponds to timeline time `origin`. */
  private ctxStart = 0;
  private origin = 0;
  private playing = false;
  /** Bumped on every play/stop so a superseded play() never schedules its nodes. */
  private generation = 0;

  async play(p: Project, from: number): Promise<void> {
    this.stop();
    const gen = ++this.generation;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.origin = from;
    // Resume without awaiting: without a user gesture the promise may not settle until one happens.
    void ctx.resume().catch(() => undefined);

    // Decodes each clip's still-to-play range up front (memory scales with the clip length).
    const pending: { clip: Clip; buffer: AudioBuffer }[] = [];
    for (const clip of audibleClips(p)) {
      if (clipEnd(clip) <= from) continue;
      const offset = Math.max(0, from - clip.start);
      const buffer = await decodeAudio(clip.mediaId, clip.in + offset, clip.out, ctx);
      if (gen !== this.generation) return;
      if (buffer) pending.push({ clip, buffer });
    }
    if (gen !== this.generation) return;

    const master = ctx.createGain();
    master.connect(ctx.destination);
    // A short lead so every node starts on the same clock tick.
    this.ctxStart = ctx.currentTime + 0.05;
    for (const { clip, buffer } of pending) {
      const node = connectClip(ctx, buffer, clip, master);
      node.start(this.ctxStart + Math.max(0, clip.start - from));
      this.nodes.push(node);
    }
    this.playing = true;
  }

  stop(): void {
    this.generation++;
    if (this.playing && this.ctx) this.origin = this.currentTime();
    this.playing = false;
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        // Already stopped or never started.
      }
      node.disconnect();
    }
    this.nodes = [];
    const ctx = this.ctx;
    this.ctx = null;
    if (ctx) void ctx.close().catch(() => undefined);
  }

  currentTime(): number {
    if (!this.ctx || !this.playing) return this.origin;
    return this.origin + Math.max(0, this.ctx.currentTime - this.ctxStart);
  }
}

export function createMixer(): Mixer {
  return new LiveMixer();
}
