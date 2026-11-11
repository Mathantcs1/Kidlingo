// The GL program of the composite's blend pass (see CompositeBuffer.blend and ./effects/shaders/blend.ts).
import { PASS_VERTEX } from './effects/programs';
import { createUnitQuad } from './effects/passResources';
import { BLEND_FRAGMENT } from './effects/shaders/blend';
import { createProgram } from './gl';
import type { Mat3 } from './gl';
import { BLEND_MODE_INDEX } from './blend';
import type { BlendMode } from '../core/model';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

export interface BlendProgram {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  /** A uniform's location (cached). */
  at(name: string): WebGLUniformLocation | null;
  dispose(): void;
}

let fragmentOverride: string | null = null;
/** TEST-ONLY (the DEV hook): compiles `source` instead of the real blend shader (null restores it). */
export function setBlendFragmentOverride(source: string | null): void {
  fragmentOverride = source;
}

/** Compiles the blend pass (backdrop on unit 0, layer on unit 1) with its unit quad. Throws like createProgram. */
export function createBlendProgram(gl: WebGL2RenderingContext): BlendProgram {
  const program = createProgram(gl, PASS_VERTEX, fragmentOverride ?? BLEND_FRAGMENT);
  let quad: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer };
  try {
    quad = createUnitQuad(gl);
  } catch (e) {
    gl.deleteProgram(program);
    throw e;
  }
  const locations = new Map<string, WebGLUniformLocation | null>();
  const at = (name: string): WebGLUniformLocation | null => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
    return locations.get(name) ?? null;
  };
  gl.useProgram(program);
  gl.uniform1i(at('u_backdrop'), 0);
  gl.uniform1i(at('u_layer'), 1);
  return {
    program,
    ...quad,
    at,
    dispose: () => {
      gl.deleteProgram(program);
      gl.deleteVertexArray(quad.vao);
      gl.deleteBuffer(quad.buffer);
    },
  };
}

/**
 * One fullscreen blend pass into the bound target: blendPixel(mode, backdrop, layer · opacity) per pixel, or with
 * `adjust` adjustPixel(mode, backdrop, layer, opacity) (an adjustment layer's result, Ruling P10), with GL
 * blending off during the draw and re-enabled after; `layerUv` maps target coordinates to the layer's.
 */
export function drawBlendPass(
  gl: WebGL2RenderingContext,
  prog: BlendProgram,
  backdrop: WebGLTexture,
  layer: WebGLTexture,
  layerUv: Mat3 | undefined,
  mode: BlendMode,
  opacity: number,
  adjust = false,
): void {
  gl.disable(gl.BLEND);
  gl.useProgram(prog.program);
  gl.bindVertexArray(prog.vao);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, layer);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, backdrop);
  gl.uniformMatrix3fv(prog.at('u_uv'), false, IDENTITY);
  gl.uniformMatrix3fv(prog.at('u_layerUv'), false, layerUv ?? IDENTITY);
  gl.uniform1i(prog.at('u_mode'), BLEND_MODE_INDEX[mode] ?? 0);
  gl.uniform1f(prog.at('u_opacity'), Math.min(1, Math.max(0, opacity)));
  gl.uniform1i(prog.at('u_adjust'), adjust ? 1 : 0);
  gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, null);
  gl.activeTexture(gl.TEXTURE0);
  gl.bindVertexArray(null);
  gl.enable(gl.BLEND);
}
