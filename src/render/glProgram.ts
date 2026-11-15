// Shader program and context helpers for the WebGL2 compositor (see gl.ts, the barrel the rest of the code imports).
import { acquireWebGl2 } from './glContext';
import type { ContextCanvas } from './glContext';
import { GlUnavailableError } from './glErrors';

/**
 * A WebGL2 context for `canvas` (see acquireWebGl2 for the attribute fallbacks) and the getContext outcomes.
 * Throws GlUnavailableError ('no-webgl2-api' or 'context-null').
 */
export function createContext(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: { preserveDrawingBuffer?: boolean } = {},
): { gl: WebGL2RenderingContext; attempts: string[] } {
  return acquireWebGl2(canvas as ContextCanvas, opts, typeof WebGL2RenderingContext !== 'undefined');
}

/**
 * Sets the bound framebuffer's alpha to 1 without touching colour. Premultiplied "over" onto opaque black already
 * keeps alpha at 1; a fallback context with an alpha channel gets this anyway so the page can never show through.
 */
export function forceOpaque(gl: WebGL2RenderingContext): void {
  gl.colorMask(false, false, false, true);
  gl.clearColor(0, 0, 0, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.colorMask(true, true, true, true);
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new GlUnavailableError('resource', 'Could not create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new GlUnavailableError('shader', `Shader compile failed: ${log || 'no info log'}`, log ?? undefined);
  }
  return shader;
}

export function createProgram(gl: WebGL2RenderingContext, vs: string, fs: string): WebGLProgram {
  const v = compileShader(gl, gl.VERTEX_SHADER, vs);
  let f: WebGLShader;
  try {
    f = compileShader(gl, gl.FRAGMENT_SHADER, fs);
  } catch (e) {
    gl.deleteShader(v);
    throw e;
  }
  const program = gl.createProgram() as WebGLProgram | null;
  if (!program) {
    gl.deleteShader(v);
    gl.deleteShader(f);
    throw new GlUnavailableError('resource', 'Could not create program');
  }
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  // The program keeps the shaders alive while it needs them.
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new GlUnavailableError('shader', `Program link failed: ${log || 'no info log'}`, log ?? undefined);
  }
  return program;
}
