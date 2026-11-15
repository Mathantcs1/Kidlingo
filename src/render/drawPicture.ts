// Draws one clip's picture (blur backdrop first, for the 'blur' fit) into the output the caller binds.
import type { BlurBackground } from './blur';
import type { Draw } from './drawCollect';
import { croppedSize } from './cropGeometry';
import { clipMatrix } from './gl';
import type { QuadRenderer } from './gl';
import type { Mat3, Rect, Size, TextureSlot } from './gl';

export function drawPicture(
  quad: QuadRenderer,
  blur: BlurBackground,
  d: Draw,
  slot: TextureSlot,
  uv: Mat3,
  format: Size,
  viewport: Rect,
  bindOutput: () => void,
): void {
  const { opacity } = d.clip.transform;
  // The blur backdrop covers the frame from the CROPPED picture (Plan 5E D7); the quad is the crop's sub-rectangle of the frame.
  if (d.clip.fit === 'blur' && d.clip.kind !== 'overlay') blur.draw(slot, croppedSize(d.size, d.clip.crop), uv, opacity, format, viewport, bindOutput);
  quad.draw(slot.tex, clipMatrix(d.size, d.clip.transform, format, { crop: d.clip.crop, anchor: d.clip.anchor }), opacity, uv);
}

export function bindCanvas(gl: WebGL2RenderingContext, viewport: Rect): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
}
