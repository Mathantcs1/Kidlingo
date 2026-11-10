// WebGL2 helpers for the compositor. Everything that takes a `gl` only touches the context it is given; the pure
// geometry lives in ./geometry and is re-exported here.
import type { Mat3 } from './geometry';
import { acquireWebGl2 } from './glContext';
import type { ContextCanvas } from './glContext';
import { GlUnavailableError } from './glErrors';

export * from './geometry';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

const VERTEX_SHADER = `#version 300 es
in vec2 a_unit;
uniform mat3 u_matrix;
uniform mat3 u_uv;
out vec2 v_uv;
void main() {
  v_uv = (u_uv * vec3(a_unit, 1.0)).xy;
  gl_Position = vec4((u_matrix * vec3(a_unit, 1.0)).xy, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_tex;
uniform float u_opacity;
out vec4 outColor;
void main() {
  // Textures hold premultiplied alpha, so opacity scales all four channels.
  outColor = texture(u_tex, v_uv) * u_opacity;
}`;

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

/** Draws textured unit quads: one program, one VAO with a triangle strip over [0, 1]². */
export class QuadRenderer {
  private readonly gl: WebGL2RenderingContext;
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly uMatrix: WebGLUniformLocation | null;
  private readonly uUv: WebGLUniformLocation | null;
  private readonly uOpacity: WebGLUniformLocation | null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    const vao = gl.createVertexArray() as WebGLVertexArrayObject | null;
    const buffer = gl.createBuffer() as WebGLBuffer | null;
    if (!vao || !buffer) {
      gl.deleteProgram(this.program);
      if (vao) gl.deleteVertexArray(vao);
      if (buffer) gl.deleteBuffer(buffer);
      throw new GlUnavailableError('resource', 'Could not create the vertex array or buffer');
    }
    this.vao = vao;
    this.buffer = buffer;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'a_unit');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.uMatrix = gl.getUniformLocation(this.program, 'u_matrix');
    this.uUv = gl.getUniformLocation(this.program, 'u_uv');
    this.uOpacity = gl.getUniformLocation(this.program, 'u_opacity');
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_tex'), 0);
  }

  /**
   * Draws `tex` through `matrix` into the currently bound framebuffer/viewport. `uv` maps the quad to texture
   * coordinates (see uvMatrix: display rotation, bottom-up FBO textures).
   */
  draw(tex: WebGLTexture, matrix: Mat3, opacity: number, uv: Mat3 = IDENTITY): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniformMatrix3fv(this.uMatrix, false, matrix);
    gl.uniformMatrix3fv(this.uUv, false, uv);
    gl.uniform1f(this.uOpacity, Math.min(1, Math.max(0, opacity)));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.buffer);
  }
}
