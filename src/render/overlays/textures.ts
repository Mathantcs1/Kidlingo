// A small LRU of overlay textures keyed by what they look like (spec, pixel size, progress frame).
import { createTexture, uploadTexture } from '../gl';
import type { TextureSlot } from '../gl';
import type { Surface } from './raster';

export const MAX_OVERLAY_TEXTURES = 32;

export class OverlayTextures {
  private readonly cache = new Map<string, TextureSlot>();

  constructor(private readonly gl: WebGL2RenderingContext) {}

  get count(): number {
    return this.cache.size;
  }

  /** The texture for `key`, rasterising and uploading it on a miss (the oldest entries beyond 32 are deleted). */
  get(key: string, width: number, height: number, build: () => Surface): TextureSlot {
    const hit = this.cache.get(key);
    if (hit) {
      this.cache.delete(key);
      this.cache.set(key, hit);
      return hit;
    }
    const slot: TextureSlot = { tex: createTexture(this.gl), width: 0, height: 0 };
    uploadTexture(this.gl, slot, build() as TexImageSource, width, height);
    this.cache.set(key, slot);
    while (this.cache.size > MAX_OVERLAY_TEXTURES) {
      const [oldKey, old] = this.cache.entries().next().value as [string, TextureSlot];
      this.gl.deleteTexture(old.tex);
      this.cache.delete(oldKey);
    }
    return slot;
  }

  dispose(): void {
    for (const s of this.cache.values()) this.gl.deleteTexture(s.tex);
    this.cache.clear();
  }
}
