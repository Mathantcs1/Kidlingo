import type { Id, Project } from '../core/model';
import type { VideoSource } from '../media/decode';
import { BlurBackground } from './blur';
import { collectDraws } from './drawCollect';
import type { DrawContext } from './drawCollect';
import { QuadRenderer, clipMatrix, createContext, forceOpaque, letterbox } from './gl';
import type { Size, TextureSlot } from './gl';
import { withAttempts } from './glErrors';
import { ImageTextures } from './images';

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
}

export interface CompositorStats {
  videoTextures: number;
  imageTextures: number;
  maxImageSide: number;
}

export interface CompositorOptions {
  /** Keep the drawing buffer after presenting (needed to read pixels back after a render). Default false. */
  preserveDrawingBuffer?: boolean;
}

const LOST = 'WebGL context lost';

class GlCompositor implements Compositor {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly quad: QuadRenderer;
  private readonly blur: BlurBackground;
  /** Textures per video source; a source used by several clips in one frame gets one texture per use. */
  private readonly videoSlots = new Map<VideoSource, TextureSlot[]>();
  private readonly images: ImageTextures;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private lost = false;
  /** A fallback context may have an alpha channel: its alpha is then forced back to opaque after each frame. */
  private readonly hasAlpha: boolean;
  private readonly onLost = (): void => {
    this.lost = true;
  };
  private readonly drawContext: DrawContext;

  /** Throws GlUnavailableError (with the getContext outcomes) after releasing whatever it had created. */
  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: CompositorOptions) {
    this.canvas = canvas;
    const { gl, attempts } = createContext(canvas, opts);
    this.gl = gl;
    this.hasAlpha = gl.getContextAttributes()?.alpha === true;
    this.quad = withAttempts(attempts, () => new QuadRenderer(gl));
    this.blur = withAttempts(attempts, () => new BlurBackground(gl, this.quad), () => this.quad.dispose());
    this.images = new ImageTextures(gl);
    this.drawContext = {
      gl,
      images: this.images,
      videoSlots: this.videoSlots,
      assertUsable: () => this.assertUsable(),
      isLive: () => !this.disposed && !this.lost,
    };
    (canvas as EventTarget).addEventListener('webglcontextlost', this.onLost);
  }

  renderFrame(p: Project, t: number, sources: Map<Id, VideoSource>): Promise<void> {
    const run = this.queue.then(() => this.render(p, t, sources));
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
    const gl = this.gl;
    for (const slots of this.videoSlots.values()) for (const s of slots) gl.deleteTexture(s.tex);
    this.videoSlots.clear();
    this.images.dispose();
    this.blur.dispose();
    this.quad.dispose();
  }

  stats(): CompositorStats {
    let videoTextures = 0;
    for (const slots of this.videoSlots.values()) videoTextures += slots.length;
    return { videoTextures, imageTextures: this.images.count, maxImageSide: this.images.maxSide };
  }

  private assertUsable(): void {
    if (this.disposed) throw new Error('Compositor is disposed');
    if (this.lost || this.gl.isContextLost()) {
      this.lost = true;
      throw new Error(LOST);
    }
  }

  private async render(p: Project, t: number, sources: Map<Id, VideoSource>): Promise<void> {
    this.assertUsable();
    // Phase 1 (async): every frame/bitmap is uploaded before anything is drawn.
    const draws = await collectDraws(this.drawContext, p, t, sources);

    // Phase 2 (sync): composite.
    this.assertUsable();
    const gl = this.gl;
    const format: Size = { width: p.format.width, height: p.format.height };
    const viewport = letterbox(format, { width: this.canvas.width, height: this.canvas.height });
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    for (const d of draws) {
      if (d.clip.fit === 'blur') this.blur.draw(d.slot, d.size, d.uv, d.clip.transform.opacity, format, viewport);
      this.quad.draw(d.slot.tex, clipMatrix(d.size, d.clip.transform, format), d.clip.transform.opacity, d.uv);
    }
    if (this.hasAlpha) forceOpaque(gl);
  }
}

/** Throws GlUnavailableError when WebGL2 cannot be started on `canvas` (see GlFailureReason). */
export function createCompositor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: CompositorOptions = {}): Compositor {
  return new GlCompositor(canvas, opts);
}
