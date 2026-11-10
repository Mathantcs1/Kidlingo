// Still-image textures for the compositor: decoded at a capped size, uploaded, and the bitmap released at once.
import type { Id, MediaRef, Project } from '../core/model';
import { getMediaFile } from '../media/storage';
import { createTexture, uploadTexture } from './gl';
import type { Size, TextureSlot } from './gl';

/** Images are held at most this many pixels on their long side (4K output never needs more). */
export const MAX_IMAGE_SIDE = 3840;

/** `size` scaled down (never up), preserving aspect, so its long side is at most `cap`. Integer, never empty. */
export function cappedSize(size: Size, cap: number): Size {
  const scale = Math.min(1, cap / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

function resized(source: ImageBitmapSource, size: Size): Promise<ImageBitmap> {
  return createImageBitmap(source, { resizeWidth: size.width, resizeHeight: size.height, resizeQuality: 'high' });
}

/** Decodes the image no larger than `cap` on its long side, without ever holding it full size when its size is known. */
async function decodeCapped(file: Blob, media: MediaRef, cap: number): Promise<ImageBitmap> {
  if (media.width && media.height && Math.max(media.width, media.height) > cap) {
    return resized(file, cappedSize({ width: media.width, height: media.height }, cap));
  }
  const bitmap = await createImageBitmap(file);
  if (Math.max(bitmap.width, bitmap.height) <= cap) return bitmap;
  try {
    return await resized(bitmap, cappedSize(bitmap, cap));
  } finally {
    bitmap.close();
  }
}

export class ImageTextures {
  private readonly cap: number;
  private readonly slots = new Map<Id, TextureSlot>();
  /** Images that could not be read or decoded; not retried while their media stays in the project. */
  private readonly failed = new Set<Id>();

  constructor(private readonly gl: WebGL2RenderingContext) {
    this.cap = Math.min(MAX_IMAGE_SIDE, gl.getParameter(gl.MAX_TEXTURE_SIZE) as number);
  }

  get count(): number {
    return this.slots.size;
  }

  get maxSide(): number {
    let max = 0;
    for (const s of this.slots.values()) max = Math.max(max, s.width, s.height);
    return max;
  }

  /**
   * The image's texture, decoding and uploading it on first use; null if it cannot be read. `usable()` is
   * checked after the async decode (the compositor may have been disposed or lost its context meanwhile).
   */
  async get(media: MediaRef, usable: () => boolean): Promise<TextureSlot | null> {
    const cached = this.slots.get(media.id);
    if (cached) return cached;
    if (this.failed.has(media.id)) return null;
    let bitmap: ImageBitmap;
    try {
      bitmap = await decodeCapped(await getMediaFile(media.id), media, this.cap);
    } catch {
      if (usable()) this.failed.add(media.id);
      return null;
    }
    try {
      if (!usable()) return null;
      const slot: TextureSlot = { tex: createTexture(this.gl), width: 0, height: 0 };
      uploadTexture(this.gl, slot, bitmap, bitmap.width, bitmap.height);
      this.slots.set(media.id, slot);
      return slot;
    } finally {
      // The texture holds the pixels now; there is no context restore that would need the bitmap again.
      bitmap.close();
    }
  }

  /** Frees textures of images not drawn in this frame and forgets failures of media that left the project. */
  prune(shown: Set<Id>, p: Project): void {
    for (const [id, slot] of this.slots) {
      if (shown.has(id)) continue;
      this.gl.deleteTexture(slot.tex);
      this.slots.delete(id);
    }
    for (const id of this.failed) if (!p.media[id]) this.failed.delete(id);
  }

  dispose(): void {
    for (const slot of this.slots.values()) this.gl.deleteTexture(slot.tex);
    this.slots.clear();
    this.failed.clear();
  }
}
