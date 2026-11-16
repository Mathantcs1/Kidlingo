// The WebGL2 compositor: Phase 1 uploads every picture of the frame, Phase 2 draws them in track order.
import type { Clip, Id, Project, VideoEffectType } from '../core/model';
import type { VideoSource } from '../media/decode';
import { BlurBackground } from './blur';
import { CompositeBuffer } from './compositeBuffer';
import type { Compositor, CompositorOptions, CompositorStats } from './compositorTypes';
import { needsComposite } from './adjustment';
import { collectDraws } from './drawCollect';
import { TransitionProgram } from './transitionPass';
import { isTransitionDraw } from './drawCollect';
import { drawSteps, transitionMode } from './drawSteps';
import type { DrawContext, FrameDraw } from './drawCollect';
import { LutTextures } from './effects/luts';
import { EffectPipeline } from './effects/pipeline';
import { unavailableTypes } from './effects/programs';
import type { LoadedLut } from './effects/types';
import { QuadRenderer, createContext, forceOpaque, letterbox } from './gl';
import type { Size, TextureSlot } from './gl';
import { withAttempts } from './glErrors';
import { ImageTextures } from './images';
import { OverlayTextures } from './overlays/textures';

export type { Compositor, CompositorOptions, CompositorStats } from './compositorTypes';

const LOST = 'WebGL context lost';

/** Every clip a frame step draws (a transition has two): for the LUT preload. */
const drawClips = (d: FrameDraw): Clip[] => (isTransitionDraw(d) ? [d.a, d.b].flatMap((x) => (x ? [x.clip] : [])) : [d.clip]);

/** Composite targets a frame needs: 3, 4 with a transition (two layers), 5 with one composited in a non-Normal mode (its scratch). */
function targetsNeeded(draws: FrameDraw[]): number {
  const transitions = draws.filter(isTransitionDraw);
  if (transitions.length === 0) return 3;
  return transitions.some((d) => transitionMode(d) !== 'normal') ? 5 : 4;
}

class GlCompositor implements Compositor {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly quad: QuadRenderer;
  private readonly blur: BlurBackground;
  /** Frames with a non-normal blend mode or an adjustment layer composite here (Ruling P2); others never touch it. */
  private readonly composite: CompositeBuffer;
  /** Textures per video source; a source used by several clips in one frame gets one texture per use. */
  private readonly videoSlots = new Map<VideoSource, TextureSlot[]>();
  private readonly images: ImageTextures;
  private readonly overlays: OverlayTextures;
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private lost = false;
  /** A fallback context may have an alpha channel: its alpha is then forced back to opaque after each frame. */
  private readonly hasAlpha: boolean;
  private readonly onLost = (): void => {
    this.lost = true;
  };
  private readonly drawContext: DrawContext;
  private readonly effects: EffectPipeline;
  private readonly onEffectUnavailable: (type: VideoEffectType) => void;
  private readonly luts: LutTextures;
  /** The LUTs loaded for the frame being drawn (Phase 1), read synchronously by EffectContext.lut in Phase 2. */
  private frameLuts = new Map<Id, LoadedLut>();
  private lutNames = new Map<Id, string>();
  /** The transition program: compiled on first use; `failed` turns transitions into hard cuts (Plan 5C Task 5). */
  private transitionPass: TransitionProgram | null = null;
  private transitionFailed = false;

  /** Throws GlUnavailableError (with the getContext outcomes) after releasing whatever it had created. */
  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: CompositorOptions) {
    this.canvas = canvas;
    const { gl, attempts } = createContext(canvas, opts);
    this.gl = gl;
    this.hasAlpha = gl.getContextAttributes()?.alpha === true;
    this.quad = withAttempts(attempts, () => new QuadRenderer(gl));
    this.blur = withAttempts(attempts, () => new BlurBackground(gl, this.quad), () => this.quad.dispose());
    this.images = new ImageTextures(gl);
    this.overlays = new OverlayTextures(gl);
    this.composite = new CompositeBuffer(gl, this.quad, () => opts.onBlendUnavailable?.());
    this.effects = new EffectPipeline(gl);
    this.onEffectUnavailable = (type) => opts.onEffectUnavailable?.(type);
    this.luts = new LutTextures(gl, (id) => opts.onLutUnavailable?.(id, this.lutNames.get(id) ?? id));
    this.drawContext = {
      gl,
      images: this.images,
      overlays: this.overlays,
      pixelScale: (format) => letterbox(format, { width: this.canvas.width, height: this.canvas.height }).width / format.width,
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
    this.overlays.dispose();
    this.luts.dispose();
    this.effects.dispose();
    this.composite.dispose();
    this.transitionPass?.dispose();
    this.blur.dispose();
    this.quad.dispose();
  }

  stats(): CompositorStats {
    let videoTextures = 0;
    for (const slots of this.videoSlots.values()) videoTextures += slots.length;
    return {
      videoTextures,
      imageTextures: this.images.count,
      maxImageSide: this.images.maxSide,
      overlayTextures: { count: this.overlays.count, bytes: this.overlays.bytes }, overlayUploads: this.overlays.uploads,
      effectPasses: this.effects.passes,
      effectMemory: this.effects.memory(),
      blendPasses: this.composite.passes,
      compositeMemory: this.composite.stats(),
    };
  }

  unavailableTypes(): VideoEffectType[] {
    return unavailableTypes();
  }

  private transitionProgramOrNull(): TransitionProgram | null {
    if (this.transitionPass || this.transitionFailed) return this.transitionPass;
    try {
      this.transitionPass = new TransitionProgram(this.gl);
    } catch (e) {
      if (this.gl.isContextLost()) throw new Error(LOST);
      this.transitionFailed = true;
      console.warn('Transitions are unavailable (a cut at the midpoint):', e);
    }
    return this.transitionPass;
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
    // LUT textures too, so the export never encodes an ungraded frame while a LUT file is still loading.
    for (const [id, m] of Object.entries(p.media)) if (m.kind === 'lut') this.lutNames.set(id, m.name);
    this.frameLuts = await this.luts.forFrame(p, draws.flatMap(drawClips));

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
    // Only a frame with a visible non-normal clip or an active adjustment layer pays for the intermediate composite.
    const composite = draws.some(needsComposite) && this.composite.begin(viewport, targetsNeeded(draws));
    if (!composite) this.composite.idle();
    drawSteps(
      { gl, quad: this.quad, blur: this.blur, composite: this.composite, effects: this.effects, luts: this.frameLuts, onUnavailable: this.onEffectUnavailable, transitionProgram: () => this.transitionProgramOrNull() },
      draws, p, t, format, viewport, composite,
    );
    if (composite) this.composite.present(viewport);
    if (this.hasAlpha) forceOpaque(gl);
  }
}

/** Throws GlUnavailableError when WebGL2 cannot be started on `canvas` (see GlFailureReason). */
export function createCompositor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: CompositorOptions = {}): Compositor {
  return new GlCompositor(canvas, opts);
}
