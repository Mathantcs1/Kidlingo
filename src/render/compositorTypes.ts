// The compositor's public contract (the implementation is ./compositor.ts).
import type { Id, Project, VideoEffectType } from '../core/model';
import type { VideoSource } from '../media/decode';

export interface Compositor {
  /**
   * Draws the project's video tracks at timeline time `t` (seconds). `sources` holds open video sources keyed
   * by clip id or, failing that, media id; video clips without a source are skipped. Overlapping calls are
   * serialised. Rejects once disposed or after the WebGL context is lost.
   */
  renderFrame(p: Project, t: number, sources: Map<Id, VideoSource>): Promise<void>;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Sets the canvas's pixel size. Transforms stay in `p.format` pixels; the output is fitted to the canvas. */
  resize(w: number, h: number): void;
  /** Deletes all GL objects. Idempotent. */
  dispose(): void;
  /** Counts of live GL textures and the largest image texture side (instrumentation for tests). */
  stats(): CompositorStats;
  /** Effect types turned off this session after a shader failure (every compositor shares this list; D8). */
  unavailableTypes(): VideoEffectType[];
}

export interface CompositorStats {
  videoTextures: number;
  imageTextures: number;
  maxImageSide: number;
  /** Effect passes drawn since creation (0 while no clip has an enabled, available effect). */
  effectPasses: number;
  /** Effect targets allocated now and their RGBA8 bytes (bounded: see TargetPool). */
  effectMemory: { targets: number; bytes: number };
  /** Blend passes drawn since creation (0 while every visible clip is 'normal'). */
  blendPasses: number;
  /** Intermediate composite targets allocated now and their RGBA8 bytes (see CompositeBuffer). */
  compositeMemory: { targets: number; bytes: number };
}

export interface CompositorOptions {
  /** Keep the drawing buffer after presenting (needed to read pixels back after a render). Default false. */
  preserveDrawingBuffer?: boolean;
  /** Called once per effect type per session when its shader cannot be used here; the clip draws without it (D8). */
  onEffectUnavailable?(type: VideoEffectType): void;
  /** Called once per compositor when the blend program cannot be compiled (not on a lost context): clips draw as Normal. */
  onBlendUnavailable?(): void;
  /**
   * Called once per LUT media (per compositor) whose file is missing, unreadable or not a valid .cube: its effect is
   * skipped and the frame still renders (D8). `name` is the media's name (see lutUnavailableMessage).
   */
  onLutUnavailable?(mediaId: Id, name: string): void;
}
