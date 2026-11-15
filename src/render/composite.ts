// Phase 2 of a frame (synchronous): composite the prepared draws bottom to top onto the canvas.
import type { Project } from '../core/model';
import type { BlurBackground } from './blur';
import type { Draw } from './frameSources';
import { clipMatrix, forceOpaque, letterbox } from './gl';
import type { QuadRenderer, Size } from './gl';

export function composite(
  gl: WebGL2RenderingContext,
  quad: QuadRenderer,
  blur: BlurBackground,
  draws: Draw[],
  p: Project,
  canvas: { width: number; height: number },
  hasAlpha: boolean,
): void {
  const format: Size = { width: p.format.width, height: p.format.height };
  const viewport = letterbox(format, { width: canvas.width, height: canvas.height });
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.disable(gl.SCISSOR_TEST);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
  for (const d of draws) {
    if (d.clip.fit === 'blur') blur.draw(d.slot, d.size, d.uv, d.clip.transform.opacity, format, viewport);
    quad.draw(d.slot.tex, clipMatrix(d.size, d.clip.transform, format), d.clip.transform.opacity, d.uv);
  }
  if (hasAlpha) forceOpaque(gl);
}
