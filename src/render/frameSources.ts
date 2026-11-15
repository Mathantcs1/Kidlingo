// Phase 1 of a frame: fetch every frame/bitmap of the clips visible at a time and upload each into its own texture.
import type { Clip, Id, Project } from '../core/model';
import type { VideoSource } from '../media/decode';
import { createTexture, frameOrientation, rotatedSize, uploadTexture, uvMatrix } from './gl';
import type { Mat3, Size, TextureSlot } from './gl';
import { ImageTextures } from './images';
import { visualClipsAt } from './visible';

/** One clip ready to composite. */
export interface Draw {
  clip: Clip;
  slot: TextureSlot;
  /** Displayed (rotated) size in source pixels. */
  size: Size;
  /** Quad → texture coordinates (applies the source's display rotation). */
  uv: Mat3;
}

/** Lets the owner abort a gather: `check` throws once disposed or the context is lost, `ok` is the soft form. */
export interface UsableGuard {
  check(): void;
  ok(): boolean;
}

const UPRIGHT = uvMatrix(0);

export class FrameSources {
  /** Textures per video source; a source used by several clips in one frame gets one texture per use. */
  private readonly videoSlots = new Map<VideoSource, TextureSlot[]>();
  private readonly images: ImageTextures;

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.images = new ImageTextures(gl);
  }

  /**
   * Nothing is drawn to the canvas here, so the browser can never present a half-composited frame while we wait on
   * decoders. Clips of unknown or missing media, and video clips without a source, are skipped.
   */
  async gather(p: Project, t: number, sources: Map<Id, VideoSource>, guard: UsableGuard): Promise<Draw[]> {
    const draws: Draw[] = [];
    const uses = new Map<VideoSource, number>();
    const shownImages = new Set<Id>();
    for (const clip of visualClipsAt(p, t)) {
      const media = p.media[clip.mediaId];
      if (!media || media.missing) continue;
      if (clip.kind === 'image') {
        const slot = await this.images.get(media, () => guard.ok());
        guard.check();
        shownImages.add(clip.mediaId);
        // Transforms are in the image's own pixels, whatever resolution its texture was decoded at.
        const size = media.width && media.height ? { width: media.width, height: media.height } : slot;
        if (slot && size) draws.push({ clip, slot, size, uv: UPRIGHT });
        continue;
      }
      const source = sources.get(clip.id) ?? sources.get(clip.mediaId);
      if (!source) continue;
      const frame = await source.frameAt(clip.in + (t - clip.start));
      guard.check();
      if (!frame) continue;
      const width = 'displayWidth' in frame ? frame.displayWidth : frame.width;
      const height = 'displayHeight' in frame ? frame.displayHeight : frame.height;
      if (!(width > 0 && height > 0)) continue;
      const n = uses.get(source) ?? 0;
      uses.set(source, n + 1);
      const slot = this.videoSlot(source, n);
      uploadTexture(this.gl, slot, frame, width, height);
      // Frames arrive unrotated; draw them at their displayed size and turn the texture lookup instead.
      const { rotation, mirror } = frameOrientation(source, frame as { rotation?: unknown; flip?: unknown });
      const size = rotatedSize({ width, height }, rotation);
      draws.push({ clip, slot, size, uv: uvMatrix(rotation, false, mirror) });
    }
    this.pruneVideoSlots(sources);
    this.images.prune(shownImages, p);
    return draws;
  }

  stats(): { videoTextures: number; imageTextures: number; maxImageSide: number } {
    let videoTextures = 0;
    for (const slots of this.videoSlots.values()) videoTextures += slots.length;
    return { videoTextures, imageTextures: this.images.count, maxImageSide: this.images.maxSide };
  }

  dispose(): void {
    for (const slots of this.videoSlots.values()) for (const s of slots) this.gl.deleteTexture(s.tex);
    this.videoSlots.clear();
    this.images.dispose();
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
