import { activeClipsAt } from '../core/timeline';
import type { Clip, Id, Project } from '../core/model';
import type { VideoSource } from '../media/decode';
import { BlurBackground } from './blur';
import { QuadRenderer, clipMatrix, createContext, createTexture, letterbox, rotatedSize, uploadTexture, uvMatrix } from './gl';
import type { Mat3, Size, TextureSlot } from './gl';
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


interface Draw {
  clip: Clip;
  slot: TextureSlot;
  /** Displayed (rotated) size in source pixels. */
  size: Size;
  /** Quad → texture coordinates (applies the source's display rotation). */
  uv: Mat3;
}

const UPRIGHT = uvMatrix(0);

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
  private readonly onLost = (): void => {
    this.lost = true;
  };

  constructor(canvas: HTMLCanvasElement | OffscreenCanvas, opts: CompositorOptions) {
    this.canvas = canvas;
    this.gl = createContext(canvas, opts);
    (canvas as EventTarget).addEventListener('webglcontextlost', this.onLost);
    this.quad = new QuadRenderer(this.gl);
    this.blur = new BlurBackground(this.gl, this.quad);
    this.images = new ImageTextures(this.gl);
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
    // Phase 1 (async): fetch every frame/bitmap and upload it into its own texture. Nothing is drawn to the
    // canvas yet, so the browser can never present a half-composited frame while we wait on decoders.
    const draws: Draw[] = [];
    const uses = new Map<VideoSource, number>();
    const shownImages = new Set<Id>();
    for (const clip of visualClipsAt(p, t)) {
      const media = p.media[clip.mediaId];
      // Clips of unknown or missing media are skipped.
      if (!media || media.missing) continue;
      if (clip.kind === 'image') {
        const slot = await this.images.get(media, () => !this.disposed && !this.lost);
        this.assertUsable();
        shownImages.add(clip.mediaId);
        // Transforms are in the image's own pixels, whatever resolution its texture was decoded at.
        const size = media.width && media.height ? { width: media.width, height: media.height } : slot;
        if (slot && size) draws.push({ clip, slot, size, uv: UPRIGHT });
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
      // Frames arrive unrotated; draw them at their displayed size and turn the texture lookup instead.
      const size = rotatedSize({ width, height }, source.rotation);
      draws.push({ clip, slot, size, uv: uvMatrix(source.rotation) });
    }
    this.pruneVideoSlots(sources);
    this.images.prune(shownImages, p);

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
