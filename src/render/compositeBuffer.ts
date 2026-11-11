// The ONE intermediate composite of the compositor (Ruling P2): blend modes (Task 11a) and adjustment layers
// (Task 13a) composite the frame into it instead of straight onto the canvas, then present it.
import type { BlendMode } from '../core/model';
import { compositeSize } from './blend';
import { createBlendProgram, drawBlendPass } from './blendProgram';
import type { BlendProgram } from './blendProgram';
import { CONTEXT_LOST, assertNotLost } from './effects/programs';
import { fullscreenMatrix, uvMatrix } from './gl';
import type { Mat3, QuadRenderer, Rect, Size, TextureSlot } from './gl';
import { RenderTarget } from './renderTarget';

/** At most this many RGBA8 bytes for the three targets (3 × 3840×2160 fit; larger viewports composite smaller). */
export const COMPOSITE_BYTE_BUDGET = 128 * 1024 * 1024;
/** The targets are released after this many frames in a row that did not use the buffer. */
export const COMPOSITE_IDLE_FRAMES = 30;
/** Reads a composite texture (stored bottom row first, like any framebuffer texture) upright. */
export const COMPOSITE_UV: Mat3 = uvMatrix(0, true);

/**
 * A ping-pong pair (the composite so far and the next one) plus a layer target, all `size` (the viewport, see
 * compositeSize). A frame: begin → draw (normal clips straight into the bound current target) → for a blended
 * layer: beginLayer, draw it, blend → present. Everything is created on first use; a frame that never calls begin
 * costs nothing but `idle`.
 */
export class CompositeBuffer {
  /** Blend passes drawn since creation (instrumentation for tests). */
  passes = 0;
  size: Size = { width: 0, height: 0 };
  private targets: [RenderTarget, RenderTarget] | null = null;
  private layer: RenderTarget | null = null;
  private cur = 0;
  private program: BlendProgram | null = null;
  private failed = false;
  private idleFrames = 0;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly quad: QuadRenderer,
    /** Called once when the blend program cannot be compiled (not on a lost context). */
    private readonly onUnavailable?: () => void,
  ) {}

  /**
   * Starts a composite for `viewport`: binds the current target (viewport = the whole target) cleared to TRANSPARENT
   * (Ruling P9: the W3C isolated-group model, so a blend mode with nothing below it behaves like Normal), and returns
   * true. Returns false, drawing nothing, when the blend program cannot be used on this device (the
   * caller then draws every clip as 'normal'). Throws Error('WebGL context lost') on a lost context.
   */
  begin(viewport: Size): boolean {
    assertNotLost(this.gl);
    if (!this.ensureProgram()) return false;
    this.idleFrames = 0;
    const max = Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)) || 4096;
    this.size = compositeSize(viewport, max, 3, COMPOSITE_BYTE_BUDGET);
    this.targets ??= this.createPair();
    this.bindCurrent();
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
    return true;
  }

  /** Binds the composite so far (premultiplied, bottom row first) and sets the viewport to it. */
  bindCurrent(): void {
    this.current().bind(this.size.width, this.size.height);
  }

  /** The composite so far as a texture (e.g. an adjustment layer's effect input; read it through COMPOSITE_UV). */
  currentSlot(): TextureSlot {
    return this.current().slot;
  }

  /** Binds the layer target cleared to transparent: draw one layer into it, then call blend. */
  beginLayer(): void {
    this.layer ??= this.create();
    this.bindLayer();
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  bindLayer(): void {
    this.layer?.bind(this.size.width, this.size.height);
  }

  /**
   * Composites `layer` (default: the layer target; `uv` maps target coordinates, bottom row first, to the layer's)
   * onto the composite so far with `mode`, `opacity` scaling the layer: blendPixel per pixel into the other target,
   * which becomes current and stays bound. A texture handed in must not be either composite target, and must still
   * hold its picture (an effect pipeline output is overwritten by the next run of its size: blend it at once).
   * `adjust` (an adjustment layer's processed composite) writes adjustPixel instead: replace, then lerp by opacity.
   */
  blend(mode: BlendMode, opacity = 1, layer?: { tex: WebGLTexture; uv: Mat3 }, adjust = false): void {
    const prog = this.program;
    const layerTarget = this.layer;
    if (!prog || !this.targets || (!layer && !layerTarget)) throw new Error('CompositeBuffer.blend before begin/beginLayer');
    const backdrop = this.current().slot.tex;
    this.cur = 1 - this.cur;
    this.bindCurrent();
    drawBlendPass(this.gl, prog, backdrop, layer?.tex ?? layerTarget!.slot.tex, layer?.uv, mode, opacity, adjust);
    this.passes++;
  }

  /**
   * Draws the composite premultiplied-over the default framebuffer's `viewport` (the letterboxed picture; the caller
   * cleared it to opaque black), leaving it bound.
   */
  present(viewport: Rect): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.quad.draw(this.current().slot.tex, fullscreenMatrix(), 1, COMPOSITE_UV);
    assertNotLost(gl);
  }

  /** A frame that did not use the buffer: after COMPOSITE_IDLE_FRAMES of them in a row the targets are freed. */
  idle(): void {
    if (!this.targets && !this.layer) return;
    if (++this.idleFrames >= COMPOSITE_IDLE_FRAMES) this.release();
  }

  /** Allocated targets and their RGBA8 bytes. */
  stats(): { targets: number; bytes: number } {
    const all = [...(this.targets ?? []), ...(this.layer ? [this.layer] : [])].filter((t) => t.slot.width > 0);
    return { targets: all.length, bytes: all.reduce((n, t) => n + t.slot.width * t.slot.height * 4, 0) };
  }

  dispose(): void {
    this.release();
    this.program?.dispose();
    this.program = null;
  }

  private current(): RenderTarget {
    if (!this.targets) throw new Error('CompositeBuffer used before begin');
    return this.targets[this.cur];
  }

  private release(): void {
    for (const t of this.targets ?? []) t.dispose();
    this.layer?.dispose();
    this.targets = null;
    this.layer = null;
    this.cur = 0;
    this.idleFrames = 0;
  }

  /** Creates the ping-pong pair one by one, disposing the first if the second cannot be created. */
  private createPair(): [RenderTarget, RenderTarget] {
    const first = this.create();
    try {
      return [first, this.create()];
    } catch (e) {
      first.dispose();
      throw e;
    }
  }

  private create(): RenderTarget {
    try {
      return new RenderTarget(this.gl);
    } catch (e) {
      assertNotLost(this.gl);
      throw e;
    }
  }

  /** Compiles the blend program once; a failure that is not a lost context turns blending off for this buffer. */
  private ensureProgram(): boolean {
    if (this.program) return true;
    if (this.failed) return false;
    try {
      this.program = createBlendProgram(this.gl);
      return true;
    } catch (e) {
      if (this.gl.isContextLost()) throw new Error(CONTEXT_LOST);
      this.failed = true;
      console.warn('Blend modes and adjustment layers are unavailable (Normal / skipped):', e);
      this.onUnavailable?.();
      return false;
    }
  }
}
