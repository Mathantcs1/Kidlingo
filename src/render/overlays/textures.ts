// Overlay clip textures for the compositor: each visible overlay is drawn with Canvas2D at about the pixel size it is
// shown at and uploaded; re-drawn only when its spec, its texture size or its animated state changes (the progress
// bar every frame, a lower third while it slides). Textures of overlays not drawn in a frame are deleted at once, so
// memory is bounded by the overlays on screen (at most MAX_OVERLAY_SIDE² × 4 bytes each for the texture plus the same
// for the overlay's own scratch canvas, which is kept so two overlays of different sizes never resize each other's).
import { clipDuration } from '../../core/model';
import type { Clip, Id } from '../../core/model';
import { overlayBaseSize } from '../../core/overlays';
import { snapToFrame } from '../effects/pipeline';
import { createTexture, uploadTexture } from '../gl';
import type { Size, TextureSlot } from '../gl';
import { BUILT_IN_SLIDES, animationAt, drawOverlay } from './draw';
import type { BuiltInSlide, OverlayContext } from './draw';

/** Longest side of an overlay texture (a 20× sticker on a 4K export is drawn at this size and scaled up). */
export const MAX_OVERLAY_SIDE = 2048;

/**
 * Total bytes of overlay TEXTURES drawn in one frame (Plan 5B Task 10): N overlays at the 2048 cap would cost N × 16 MiB
 * (and as much again in their scratch canvases). Overlays asked for after the budget is spent are drawn from a smaller
 * texture (same shape and place on screen, less sharp); 128 MiB fits eight capped overlays, far past any ordinary
 * project, so preview and export match unless a frame needs more than that. Each texture is at least 1×1, so the bound
 * is the budget plus 4 bytes per overlay that arrives after it is gone.
 */
export const OVERLAY_BYTE_BUDGET = 128 * 2 ** 20;

type Scratch = OffscreenCanvas | HTMLCanvasElement;

interface Entry {
  slot: TextureSlot;
  key: string;
  scratch: Scratch;
  ctx: OverlayContext;
}

/** A 2D-capable scratch canvas and its context: OffscreenCanvas when it gives a context, else a <canvas>; null if neither. */
export function createScratch(): { canvas: Scratch; ctx: OverlayContext } | null {
  const tries: Array<() => Scratch> = [];
  if (typeof OffscreenCanvas !== 'undefined') tries.push(() => new OffscreenCanvas(1, 1));
  if (typeof document !== 'undefined') tries.push(() => document.createElement('canvas'));
  for (const make of tries) {
    try {
      const canvas = make();
      const ctx = canvas.getContext('2d') as OverlayContext | null;
      if (ctx) return { canvas, ctx };
    } catch {
      // try the next kind of canvas
    }
  }
  return null;
}

/** What the compositor draws for an overlay: its texture, its size in format px at scale 1, and the texture's size. */
export interface OverlayDraw {
  slot: TextureSlot;
  size: Size;
  texels: Size;
}

/** Texture size for `base` format px shown at `scale` with `pixelScale` output px per format px: rounded, capped, ≥ 1. */
export function overlayTextureSize(base: Size, scale: number, pixelScale: number, cap: number): Size {
  const k = Math.abs(scale) * pixelScale;
  const s = Number.isFinite(k) && k > 0 ? k : 1;
  const w = base.width * s;
  const h = base.height * s;
  const fit = Math.min(1, cap / Math.max(w, h));
  return { width: Math.max(1, Math.round(w * fit)), height: Math.max(1, Math.round(h * fit)) };
}

export class OverlayTextures {
  private readonly entries = new Map<Id, Entry>();
  private readonly cap: number;
  private warned = false;
  private uploadCount = 0;
  private used = 0;

  constructor(private readonly gl: WebGL2RenderingContext, private readonly budget = OVERLAY_BYTE_BUDGET) {
    this.cap = Math.min(MAX_OVERLAY_SIDE, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
  }

  get count(): number {
    return this.entries.size;
  }

  get bytes(): number {
    let n = 0;
    for (const e of this.entries.values()) n += e.slot.width * e.slot.height * 4;
    return n;
  }

  /** Starts a frame's byte accounting (the compositor calls it before collecting the frame's draws). */
  beginFrame(): void {
    this.used = 0;
  }

  /** Texture uploads since creation (instrumentation: an animated scale must not re-upload every frame). */
  get uploads(): number {
    return this.uploadCount;
  }

  /**
   * The overlay clip's picture at timeline time `t` (clip time snapped to the project frame, like effects), drawn at
   * `pixelScale` output px per format px; null when it has no spec or 2D canvas drawing is unavailable. The texture
   * is sized for `textureScale` (REQUIRED: the compositor passes the largest scale the clip can be drawn at, maxDrawnScale:
   * keys, key loops and presets, Plan 5 Task 5 / 5B Task 6), so it is independent of the scale at `t`: an animated scale
   * reuses one texture, sharp at its largest size. `builtIn` (in the texture key) turns a lower third's built-in slide
   * off at an edge with an in/out preset (5B D13), so a preset-driven lower third is one still texture.
   */
  get(
    clip: Clip, format: Size, t: number, fps: number, pixelScale: number, textureScale: number,
    builtIn: Readonly<BuiltInSlide> = BUILT_IN_SLIDES,
  ): OverlayDraw | null {
    const spec = clip.overlay;
    if (!spec) return null;
    const size = overlayBaseSize(spec.type, format);
    const tex = this.withinBudget(overlayTextureSize(size, textureScale, pixelScale, this.cap));
    const duration = clipDuration(clip);
    const progress = duration > 0 ? snapToFrame(t - clip.start, fps) / duration : 0;
    const anim = animationAt(spec.type, progress, duration, builtIn);
    const key = `${JSON.stringify(spec)}|${tex.width}x${tex.height}|${anim.slide}|${anim.fill}|${duration}|${+builtIn.in}${+builtIn.out}`;
    let entry = this.entries.get(clip.id);
    if (entry?.key !== key) {
      if (!entry) {
        const made = this.scratchFor();
        if (!made) return null;
        entry = { slot: { tex: createTexture(this.gl), width: 0, height: 0 }, key, scratch: made.canvas, ctx: made.ctx };
      }
      if (entry.scratch.width !== tex.width) entry.scratch.width = tex.width;
      if (entry.scratch.height !== tex.height) entry.scratch.height = tex.height;
      drawOverlay(entry.ctx, spec, tex, progress, duration, builtIn);
      uploadTexture(this.gl, entry.slot, entry.scratch, tex.width, tex.height);
      this.uploadCount++;
      entry.key = key;
      this.entries.set(clip.id, entry);
    }
    return { slot: entry.slot, size, texels: tex };
  }

  /** `tex`, shrunk (aspect kept) to what is left of this frame's byte budget, and counted against it. */
  private withinBudget(tex: Size): Size {
    const bytes = tex.width * tex.height * 4;
    let out = tex;
    if (this.used + bytes > this.budget) {
      const f = Math.sqrt(Math.max(0, this.budget - this.used) / bytes);
      out = { width: Math.max(1, Math.floor(tex.width * f)), height: Math.max(1, Math.floor(tex.height * f)) };
    }
    this.used += out.width * out.height * 4;
    return out;
  }

  /** Deletes the textures of overlays not in `drawn` (call once per frame after collecting its draws). */
  prune(drawn: ReadonlySet<Id>): void {
    this.used = 0;
    for (const [id, e] of this.entries) {
      if (drawn.has(id)) continue;
      this.release(e);
      this.entries.delete(id);
    }
  }

  dispose(): void {
    this.prune(new Set());
  }

  private release(e: Entry): void {
    this.gl.deleteTexture(e.slot.tex);
    e.scratch.width = 1;
    e.scratch.height = 1;
  }

  private scratchFor(): ReturnType<typeof createScratch> {
    const made = createScratch();
    if (!made && !this.warned) {
      this.warned = true;
      console.warn('clipforge: 2D canvas drawing is unavailable; overlays are not drawn');
    }
    return made;
  }
}
