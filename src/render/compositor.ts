import type { FxType, Id, Project } from '../core/model';
import type { VideoSource } from '../media/decode';
import { BlurBackground } from './blur';
import { composite } from './composite';
import { FrameSources } from './frameSources';
import { FxEngine } from './fx/engine';
import { QuadRenderer, createContext } from './gl';
import { withAttempts } from './glErrors';

export interface Compositor {
  /**
   * Draws the project's video tracks at timeline time `t` (seconds). `sources` holds open video sources keyed
   * by clip id or, failing that, media id; video clips without a source are skipped. Overlapping calls are
   * serialised. Rejects once disposed or after the WebGL context is lost.
   */
  renderFrame(p: Project, t: number, sources: Map<Id, VideoSource>, opts?: RenderOptions): Promise<void>;
  canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Sets the canvas's pixel size. Transforms stay in `p.format` pixels; the output is fitted to the canvas. */
  resize(w: number, h: number): void;
  /** Deletes all GL objects. Idempotent. */
  dispose(): void;
  /** Counts of live GL textures and the largest image texture side (instrumentation for tests). */
  stats(): CompositorStats;
}

export interface RenderOptions {
  /** Preview-only "Effects off" view: draw every clip without its effects. The exporter never sets it. */
  bypassFx?: boolean;
}

export interface CompositorStats {
  videoTextures: number;
  /** Live offscreen effect targets (bounded; instrumentation for tests). */
  fxTargets: number;
  imageTextures: number;
  maxImageSide: number;
}

export interface CompositorOptions {
  /** Keep the drawing buffer after presenting (needed to read pixels back after a render). Default false. */
  preserveDrawingBuffer?: boolean;
  /** Called ONCE per effect type whose shader fails to compile on this GPU; that effect is then skipped. */
  onFxError?: (type: FxType, log: string) => void;
}

const LOST = 'WebGL context lost';

class GlCompositor implements Compositor {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly quad: QuadRenderer;
  private readonly blur: BlurBackground;
  private readonly frames: FrameSources;
  private readonly fx: FxEngine;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private lost = false;
  /** A fallback context may have an alpha channel: its alpha is then forced back to opaque after each frame. */
  private readonly hasAlpha: boolean;
  private readonly onLost = (): void => {
    this.lost = true;
  };

  /** Throws GlUnavailableError (with the getContext outcomes) after releasing whatever it had created. */
  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: CompositorOptions) {
    this.canvas = canvas;
    const { gl, attempts } = createContext(canvas, opts);
    this.gl = gl;
    this.hasAlpha = gl.getContextAttributes()?.alpha === true;
    this.quad = withAttempts(attempts, () => new QuadRenderer(gl));
    this.blur = withAttempts(attempts, () => new BlurBackground(gl, this.quad), () => this.quad.dispose());
    this.frames = new FrameSources(gl);
    this.fx = new FxEngine(gl, this.quad, opts.onFxError);
    (canvas as EventTarget).addEventListener('webglcontextlost', this.onLost);
  }

  renderFrame(p: Project, t: number, sources: Map<Id, VideoSource>, opts: RenderOptions = {}): Promise<void> {
    const run = this.queue.then(() => this.render(p, t, sources, opts));
    this.queue = run.catch(() => undefined);
    return run;
  }

  resize(w: number, h: number): void {
    this.canvas.width = Math.max(1, Math.round(w));
    this.canvas.height = Math.max(1, Math.round(h));
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    (this.canvas as EventTarget).removeEventListener('webglcontextlost', this.onLost);
    this.frames.dispose();
    this.fx.dispose();
    this.blur.dispose();
    this.quad.dispose();
  }

  stats(): CompositorStats {
    return { ...this.frames.stats(), fxTargets: this.fx.targetCount() };
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Compositor is disposed');
    if (this.lost || this.gl.isContextLost()) {
      this.lost = true;
      throw new Error(LOST);
    }
  }

  private async render(p: Project, t: number, sources: Map<Id, VideoSource>, opts: RenderOptions): Promise<void> {
    this.assertUsable();
    const draws = await this.frames.gather(p, t, sources, {
      check: () => this.assertUsable(),
      ok: () => !this.disposed && !this.lost,
    });
    this.assertUsable();
    const fx = opts.bypassFx ? { draws, targets: [] } : this.fx.process(draws, p, t, this.canvas);
    try {
      composite(this.gl, this.quad, this.blur, fx.draws, p, this.canvas, this.hasAlpha);
    } finally {
      this.fx.release(fx.targets);
    }
  }
}

/** Throws GlUnavailableError when WebGL2 cannot be started on `canvas` (see GlFailureReason). */
export function createCompositor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: CompositorOptions = {}): Compositor {
  return new GlCompositor(canvas, opts);
}
