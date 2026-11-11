// Overlay clip textures for the compositor: each visible overlay is drawn with Canvas2D at about the pixel size it is
// shown at and uploaded; re-drawn only when its spec, its texture size or its animated state changes (the progress
// bar every frame, a lower third while it slides). Textures of overlays not drawn in a frame are deleted at once, so
// memory is bounded by the overlays on screen (at most MAX_OVERLAY_SIDE² × 4 bytes each).
import { clipDuration } from '../../core/model';
import type { Clip, Id } from '../../core/model';
import { overlayBaseSize } from '../../core/overlays';
import { snapToFrame } from '../effects/pipeline';
import { createTexture, uploadTexture } from '../gl';
import type { Size, TextureSlot } from '../gl';
import { animationAt, drawOverlay } from './draw';
import type { OverlayContext } from './draw';

/** Longest side of an overlay texture (a 20× sticker on a 4K export is drawn at this size and scaled up). */
export const MAX_OVERLAY_SIDE = 2048;

type Scratch = OffscreenCanvas | HTMLCanvasElement;

interface Entry {
  slot: TextureSlot;
  key: string;
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
  private scratch: Scratch | null = null;
  private ctx2d: OverlayContext | null = null;
  private warned = false;

  constructor(private readonly gl: WebGL2RenderingContext) {
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

  /**
   * The overlay clip's picture at timeline time `t` (clip time snapped to the project frame, like effects), drawn at
   * `pixelScale` output px per format px; null when it has no spec or 2D canvas drawing is unavailable.
   */
  get(clip: Clip, format: Size, t: number, fps: number, pixelScale: number): OverlayDraw | null {
    const spec = clip.overlay;
    if (!spec) return null;
    const size = overlayBaseSize(spec.type, format);
    const tex = overlayTextureSize(size, clip.transform.scale, pixelScale, this.cap);
    const duration = clipDuration(clip);
    const progress = duration > 0 ? snapToFrame(t - clip.start, fps) / duration : 0;
    const anim = animationAt(spec.type, progress, duration);
    const key = `${JSON.stringify(spec)}|${tex.width}x${tex.height}|${anim.slide}|${anim.fill}|${duration}`;
    let entry = this.entries.get(clip.id);
    if (entry?.key !== key) {
      const ctx = this.context(tex);
      if (!ctx || !this.scratch) return null;
      drawOverlay(ctx, spec, tex, progress, duration);
      entry ??= { slot: { tex: createTexture(this.gl), width: 0, height: 0 }, key };
      uploadTexture(this.gl, entry.slot, this.scratch, tex.width, tex.height);
      entry.key = key;
      this.entries.set(clip.id, entry);
    }
    return { slot: entry.slot, size, texels: tex };
  }

  /** Deletes the textures of overlays not in `drawn` (call once per frame after collecting its draws). */
  prune(drawn: ReadonlySet<Id>): void {
    for (const [id, e] of this.entries) {
      if (drawn.has(id)) continue;
      this.gl.deleteTexture(e.slot.tex);
      this.entries.delete(id);
    }
  }

  dispose(): void {
    this.prune(new Set());
    if (this.scratch) {
      this.scratch.width = 1;
      this.scratch.height = 1;
    }
    this.scratch = null;
    this.ctx2d = null;
  }

  /** The shared scratch canvas sized to `size` (resizing clears it), and its 2D context; null when unavailable. */
  private context(size: Size): OverlayContext | null {
    if (!this.scratch) {
      this.scratch = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : document.createElement('canvas');
      this.ctx2d = (this.scratch.getContext('2d') as OverlayContext | null) ?? null;
      if (!this.ctx2d && !this.warned) {
        this.warned = true;
        console.warn('clipforge: 2D canvas drawing is unavailable; overlays are not drawn');
      }
    }
    if (this.scratch.width !== size.width) this.scratch.width = size.width;
    if (this.scratch.height !== size.height) this.scratch.height = size.height;
    return this.ctx2d;
  }
}
