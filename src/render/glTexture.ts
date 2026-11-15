// Texture helpers for the WebGL2 compositor (re-exported by gl.ts).
import { GlUnavailableError } from './glErrors';

/** A texture with linear filtering and clamped edges, ready for `uploadTexture`. */
export function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new GlUnavailableError('resource', 'Could not create texture');
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return tex;
}

/** A texture's current allocation, so same-size updates can use texSubImage2D. */
export interface TextureSlot {
  tex: WebGLTexture;
  width: number;
  height: number;
  /** True while the mip chain matches level 0 (cleared by every upload). */
  mipmapped?: boolean;
}

/** Uploads `source` (premultiplied, top row first) into the slot's texture, reallocating only on size change. */
export function uploadTexture(
  gl: WebGL2RenderingContext,
  slot: TextureSlot,
  source: TexImageSource,
  width: number,
  height: number,
): void {
  gl.bindTexture(gl.TEXTURE_2D, slot.tex);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  slot.mipmapped = false;
  if (slot.width === width && slot.height === height) {
    gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, gl.RGBA, gl.UNSIGNED_BYTE, source);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    slot.width = width;
    slot.height = height;
  }
}
