// Types of the live playback mixer (see mixer.ts).
import type { Clip, Id, Project } from '../core/model';
import type { ClipChain } from './chain';
import type { GainPoint } from './fade';

/** Live playback of a project's audio through an AudioContext. */
export interface Mixer {
  /**
   * Stops any current playback, then decodes the first window of audible audio from timeline time `from`
   * (seconds) and schedules it; later windows are decoded and scheduled in the background. Resolves once the
   * first window is scheduled and the clock runs.
   */
  play(p: Project, from: number): Promise<void>;
  /** Stops playback, cancels pending decodes and releases the scheduled nodes. Idempotent. */
  stop(): void;
  /** Timeline seconds of the playhead, derived from the AudioContext clock; 0 before the first play. */
  currentTime(): number;
  /** AudioContext time at which timeline time `from` of the current play() plays (tests). */
  debugClockStart(): number;
}

/** One scheduled piece: source [srcFrom, srcTo) of a clip plays over context time [start, end). */
export interface ScheduledPiece {
  clipId: Id;
  srcFrom: number;
  srcTo: number;
  start: number;
  end: number;
  /** Seconds cut from its beginning because it was scheduled after its start time (0 normally). */
  late: number;
}

export interface MixerOptions {
  /** The context to play through (or a getter called at each play()); default: a private AudioContext. */
  context?: AudioContext | (() => AudioContext);
  /** Window length in seconds (default LIVE_WINDOW_SECONDS). */
  windowSeconds?: number;
  /** Called when a background window fails to decode (playback of later windows stops). */
  onError?(e: unknown): void;
  /** Test hook: called for every piece scheduled. */
  onSchedule?(piece: ScheduledPiece): void;
}

/** State of one play() of the live mixer (see mixer.ts). */
export interface Session {
  gen: number;
  /** Aborted on stop so pending decodes end early. */
  abort: AbortController;
  ctx: AudioContext;
  from: number;
  ctxStart: number;
  clips: Clip[];
  /** Clip id → its track's volume (see plan.trackVolumes). */
  trackVolumes: Map<Id, number>;
  /** Clip id → its track's duck envelope (see duck.clipDuckPoints). */
  duckPoints: Map<Id, GainPoint[]>;
  windows: [number, number][];
  next: number;
  names: Map<Id, string>;
  master: GainNode | null;
  /** Scheduled source nodes and their clip chains, dropped as they end. */
  nodes: Map<AudioBufferSourceNode, ClipChain>;
  timer: ReturnType<typeof setTimeout> | undefined;
  wake: (() => void) | null;
}
