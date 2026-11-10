import { activeClipsAt } from '../core/timeline';
import type { Clip, Id, Project } from '../core/model';
import type { VideoSource } from '../media/decode';
import { getMediaFile } from '../media/storage';
import { QuadRenderer, RenderTarget, clipMatrix, createContext, createTexture, fullscreenMatrix, letterbox, uploadTexture } from './gl';
import type { Rect, Size, TextureSlot } from './gl';

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
  /** Deletes all GL objects and closes cached bitmaps. Idempotent. */
  dispose(): void;
}

export interface CompositorOptions {
  /** Keep the drawing buffer after presenting (needed to read pixels back after a render). Default false. */
  preserveDrawingBuffer?: boolean;
}

/** The blurred background is rendered at about this fraction of the output size, then upscaled. */
const BLUR_DOWNSCALE = 16;

interface ImageEntry {
  bitmap: ImageBitmap;
  slot: TextureSlot;
}

interface Draw {
  clip: Clip;
  tex: WebGLTexture;
  size: Size;
}

const LOST = 'WebGL context lost';

class GlCompositor implements Compositor {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  private readonly gl: WebGL2RenderingContext;
  private readonly quad: QuadRenderer;
  private readonly blurTarget: RenderTarget;
  /** Textures per video source; a source used by several clips in one frame gets one texture per use. */
  private readonly videoSlots = new Map<VideoSource, TextureSlot[]>();
  private readonly images = new Map<Id, ImageEntry>();
  /** Images that could not be read or decoded; never retried for the life of this compositor. */
  private readonly failedImages = new Set<Id>();
  private queue: Promise<unknown> = Promise.resolve();
  private disposed = false;
  private lost = false;
  private readonly onLost = (): void => {
    this.lost = true;
  };

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: CompositorOptions) {
    this.canvas = canvas;
    this.gl = createContext(canvas, opts);
    (canvas as EventTarget).addEventListener('webglcontextlost', this.onLost);
    this.quad = new QuadRenderer(this.gl);
    this.blurTarget = new RenderTarget(this.gl);
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
    for (const e of this.images.values()) {
      gl.deleteTexture(e.slot.tex);
      e.bitmap.close();
    }
    this.images.clear();
    this.failedImages.clear();
    this.blurTarget.dispose();
    this.quad.dispose();
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
    // Phase 1 (async): fetch every frame/bitmap and upload it into its own texture. Nothing is drawn to the
    // canvas yet, so the browser can never present a half-composited frame while we wait on decoders.
    const draws: Draw[] = [];
    const uses = new Map<VideoSource, number>();
    for (const clip of visualClipsAt(p, t)) {
      const media = p.media[clip.mediaId];
      // Unknown media is skipped too: pruneImages would otherwise delete its texture before it is drawn.
      if (!media || media.missing) continue;
      if (clip.kind === 'image') {
        const entry = await this.image(clip.mediaId);
        this.assertUsable();
        if (entry) draws.push({ clip, tex: entry.slot.tex, size: entry.slot });
        continue;
      }
      const source = sources.get(clip.id) ?? sources.get(clip.mediaId);
      if (!source) continue;
      const frame = await source.frameAt(clip.in + (t - clip.start));
      this.assertUsable();
      if (!frame) continue;
      const width = 'displayWidth' in frame ? frame.displayWidth : frame.width;
      const height = 'displayHeight' in frame ? frame.displayHeight : frame.height;
      if (!(width > 0 && height > 0)) continue;
      const n = uses.get(source) ?? 0;
      uses.set(source, n + 1);
      const slot = this.videoSlot(source, n);
      uploadTexture(this.gl, slot, frame, width, height);
      draws.push({ clip, tex: slot.tex, size: { width, height } });
    }
    this.pruneVideoSlots(sources);
    this.pruneImages(p);

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
      if (d.clip.fit === 'blur') this.drawBlurBackground(d, format, viewport);
      this.quad.draw(d.tex, clipMatrix(d.size, d.clip.transform, format), d.clip.transform.opacity);
    }
  }

  /** Draws the clip scaled to cover the canvas into a tiny target, then stretches that over the viewport. */
  private drawBlurBackground(d: Draw, format: Size, viewport: Rect): void {
    const gl = this.gl;
    const w = Math.max(1, Math.round(viewport.width / BLUR_DOWNSCALE));
    const h = Math.max(1, Math.round(viewport.height / BLUR_DOWNSCALE));
    this.blurTarget.bind(w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const cover = Math.max(format.width / d.size.width, format.height / d.size.height);
    this.quad.draw(d.tex, clipMatrix(d.size, { x: 0, y: 0, scale: cover, rotation: 0, opacity: 1 }, format), 1);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    // Framebuffer textures are stored bottom row first.
    this.quad.draw(this.blurTarget.slot.tex, fullscreenMatrix(), d.clip.transform.opacity, true);
  }

  private videoSlot(source: VideoSource, index: number): TextureSlot {
    let slots = this.videoSlots.get(source);
    if (!slots) {
      slots = [];
      this.videoSlots.set(source, slots);
    }
    while (slots.length <= index) slots.push({ tex: createTexture(this.gl), width: 0, height: 0 });
    return slots[index];
  }

  /** Drops textures of sources the caller no longer passes (they may have been closed). */
  private pruneVideoSlots(sources: Map<Id, VideoSource>): void {
    const live = new Set(sources.values());
    for (const [source, slots] of this.videoSlots) {
      if (live.has(source)) continue;
      for (const s of slots) this.gl.deleteTexture(s.tex);
      this.videoSlots.delete(source);
    }
  }

  /** Drops cached images whose media is no longer in the project. */
  private pruneImages(p: Project): void {
    for (const [id, e] of this.images) {
      if (p.media[id]) continue;
      this.gl.deleteTexture(e.slot.tex);
      e.bitmap.close();
      this.images.delete(id);
    }
  }

  /** Loads, uploads and caches an image's bitmap; null if it cannot be read (remembered, so never retried per frame). */
  private async image(mediaId: Id): Promise<ImageEntry | null> {
    const cached = this.images.get(mediaId);
    if (cached) return cached;
    if (this.failedImages.has(mediaId)) return null;
    let bitmap: ImageBitmap;
    try {
      bitmap = await createImageBitmap(await getMediaFile(mediaId));
    } catch {
      if (!this.disposed) this.failedImages.add(mediaId);
      return null;
    }
    if (this.disposed || this.lost) {
      bitmap.close();
      return null;
    }
    const slot: TextureSlot = { tex: createTexture(this.gl), width: 0, height: 0 };
    uploadTexture(this.gl, slot, bitmap, bitmap.width, bitmap.height);
    const entry = { bitmap, slot };
    this.images.set(mediaId, entry);
    return entry;
  }
}

/** Active video/image clips on video tracks, bottom track first. */
function visualClipsAt(p: Project, t: number): Clip[] {
  const onVideoTracks = new Set<Id>();
  for (const track of p.tracks) {
    if (track.kind === 'video') for (const c of track.clips) onVideoTracks.add(c.id);
  }
  return activeClipsAt(p, t).filter((c) => onVideoTracks.has(c.id) && (c.kind === 'video' || c.kind === 'image'));
}

export function createCompositor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: CompositorOptions = {}): Compositor {
  return new GlCompositor(canvas, opts);
}
