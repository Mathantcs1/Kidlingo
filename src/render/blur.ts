// The 'blur' fit's background: the clip scaled to cover the frame, heavily downscaled and stretched back up.
import { clipMatrix, fullscreenMatrix, uvMatrix } from './gl';
import type { Mat3, QuadRenderer, Rect, Size, TextureSlot } from './gl';
import { RenderTarget } from './renderTarget';

/** The blurred background is rendered at about this fraction of the output size, then upscaled. */
const BLUR_DOWNSCALE = 16;
const FLIPPED = uvMatrix(0, true);

export class BlurBackground {
  private readonly target: RenderTarget;

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly quad: QuadRenderer,
  ) {
    this.target = new RenderTarget(gl);
  }

  /**
   * Draws `slot` (shown at `size` through `uv`) scaled to cover `format` into a target 1/16 of the viewport, then
   * stretches that over the viewport, leaving it bound. The downscale samples the source's mipmaps (a chain of 2x
   * box filters), so each low-res pixel is the average of the whole area it covers: fine detail and moving video
   * give a steady blur instead of aliasing/shimmer.
   */
  draw(slot: TextureSlot, size: Size, uv: Mat3, opacity: number, format: Size, viewport: Rect): void {
    const gl = this.gl;
    const w = Math.max(1, Math.round(viewport.width / BLUR_DOWNSCALE));
    const h = Math.max(1, Math.round(viewport.height / BLUR_DOWNSCALE));
    this.target.bind(w, h);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const cover = Math.max(format.width / size.width, format.height / size.height);
    gl.bindTexture(gl.TEXTURE_2D, slot.tex);
    if (!slot.mipmapped) {
      gl.generateMipmap(gl.TEXTURE_2D);
      slot.mipmapped = true;
    }
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    this.quad.draw(slot.tex, clipMatrix(size, { x: 0, y: 0, scale: cover, rotation: 0, opacity: 1 }, format), 1, uv);
    // The normal draw samples level 0 only (its mip chain goes stale on the next upload).
    gl.bindTexture(gl.TEXTURE_2D, slot.tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
    // Framebuffer textures are stored bottom row first.
    this.quad.draw(this.target.slot.tex, fullscreenMatrix(), opacity, FLIPPED);
  }

  dispose(): void {
    this.target.dispose();
  }
}
