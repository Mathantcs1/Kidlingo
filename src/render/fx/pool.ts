// Pooled offscreen render targets (RGBA8) for the effect passes. Targets hold the image with its TOP at texture
// t = 1 (they are written with fullscreenMatrix), so readers sample them with a flipped uv or `src()` in the shaders.
import { createTexture } from '../gl';
import type { TextureSlot } from '../gl';
import { GlUnavailableError } from '../glErrors';

export interface Target {
  slot: TextureSlot;
  fbo: WebGLFramebuffer;
  width: number;
  height: number;
}

/** Free targets kept between frames; the oldest beyond this are deleted at the end of each frame. */
export const MAX_FREE_TARGETS = 6;

export class TargetPool {
  private free: Target[] = [];
  private readonly all = new Set<Target>();

  constructor(private readonly gl: WebGL2RenderingContext) {}

  acquire(width: number, height: number): Target {
    const i = this.free.findIndex((t) => t.width === width && t.height === height);
    if (i >= 0) {
      const [t] = this.free.splice(i, 1);
      t.slot.mipmapped = false;
      return t;
    }
    const t = this.create(width, height);
    this.all.add(t);
    return t;
  }

  release(t: Target): void {
    if (this.all.has(t) && !this.free.includes(t)) this.free.push(t);
  }

  /** Deletes the oldest free targets beyond MAX_FREE_TARGETS. */
  endFrame(): void {
    while (this.free.length > MAX_FREE_TARGETS) this.delete(this.free.shift() as Target);
  }

  /** `total` = every live GL target (in use or free). */
  stats(): { total: number; free: number } {
    return { total: this.all.size, free: this.free.length };
  }

  dispose(): void {
    for (const t of [...this.all]) this.delete(t);
    this.free = [];
  }

  private delete(t: Target): void {
    this.gl.deleteFramebuffer(t.fbo);
    this.gl.deleteTexture(t.slot.tex);
    this.all.delete(t);
  }

  private create(width: number, height: number): Target {
    const gl = this.gl;
    const fbo = gl.createFramebuffer() as WebGLFramebuffer | null;
    if (!fbo) throw new GlUnavailableError('resource', 'Could not create framebuffer');
    const tex = createTexture(gl);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) {
      gl.deleteFramebuffer(fbo);
      gl.deleteTexture(tex);
      throw new GlUnavailableError('resource', `Framebuffer incomplete at ${width}x${height}`);
    }
    return { slot: { tex, width, height }, fbo, width, height };
  }
}
