import { createTexture } from './gl';
import { GlUnavailableError } from './glErrors';
import type { TextureSlot } from './gl';

/** A colour-only framebuffer backed by a linearly filtered texture (used for the cheap blur background). */
export class RenderTarget {
  readonly slot: TextureSlot;
  private readonly gl: WebGL2RenderingContext;
  private readonly fbo: WebGLFramebuffer;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const fbo = gl.createFramebuffer() as WebGLFramebuffer | null;
    if (!fbo) throw new GlUnavailableError('resource', 'Could not create framebuffer');
    this.fbo = fbo;
    try {
      this.slot = { tex: createTexture(gl), width: 0, height: 0 };
    } catch (e) {
      gl.deleteFramebuffer(fbo);
      throw e;
    }
  }

  /** Binds the framebuffer at `width` x `height` (reallocating on change) and sets the viewport to it. */
  bind(width: number, height: number): void {
    const gl = this.gl;
    if (this.slot.width !== width || this.slot.height !== height) {
      gl.bindTexture(gl.TEXTURE_2D, this.slot.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.slot.tex, 0);
      this.slot.width = width;
      this.slot.height = height;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
    gl.viewport(0, 0, width, height);
  }

  dispose(): void {
    this.gl.deleteFramebuffer(this.fbo);
    this.gl.deleteTexture(this.slot.tex);
  }
}
