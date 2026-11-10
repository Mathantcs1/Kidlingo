// WebGL2 helpers for the compositor. The matrix functions at the top are pure (no DOM, no GL) so they can
// be unit-tested; everything that takes a `gl` only touches the context it is given.
import type { Transform } from '../core/model';

/** A 3x3 matrix in column-major order (as `uniformMatrix3fv` expects). */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Applies `m` to the point (x, y, 1) and returns the resulting (x, y). */
export function applyMat3(m: Mat3, x: number, y: number): [number, number] {
  return [m[0] * x + m[3] * y + m[6], m[1] * x + m[4] * y + m[7]];
}

/**
 * Maps the unit quad (u, v) ∈ [0, 1]², v = 0 at the top of the source image, to clip space for a canvas of
 * `canvas` logical pixels. The quad is `src * scale` pixels, rotated `rotation` degrees clockwise about its
 * centre, then centred at (x, y) canvas pixels from the canvas centre with y pointing down.
 */
export function clipMatrix(src: Size, t: Transform, canvas: Size): Mat3 {
  const sw = src.width * t.scale;
  const sh = src.height * t.scale;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Canvas pixels relative to the centre (y down): p = R · ((u - ½)·sw, (v - ½)·sh) + (x, y).
  const ax = 2 / canvas.width;
  const ay = -2 / canvas.height;
  return [
    ax * sw * cos,
    ay * sw * sin,
    0,
    ax * -sh * sin,
    ay * sh * cos,
    0,
    ax * (-0.5 * sw * cos + 0.5 * sh * sin + t.x),
    ay * (-0.5 * sw * sin - 0.5 * sh * cos + t.y),
    1,
  ];
}

/** Maps the unit quad onto the whole of clip space, v = 0 at the top. */
export function fullscreenMatrix(): Mat3 {
  return [2, 0, 0, 0, -2, 0, -1, 1, 1];
}

/** The largest rectangle of `content`'s aspect ratio that fits in `target`, centred; integer pixels, never empty. */
export function letterbox(content: Size, target: Size): Rect {
  const scale = Math.min(target.width / content.width, target.height / content.height);
  const width = Math.max(1, Math.min(target.width, Math.round(content.width * scale)));
  const height = Math.max(1, Math.min(target.height, Math.round(content.height * scale)));
  return {
    x: Math.max(0, Math.floor((target.width - width) / 2)),
    y: Math.max(0, Math.floor((target.height - height) / 2)),
    width,
    height,
  };
}

const VERTEX_SHADER = `#version 300 es
in vec2 a_unit;
uniform mat3 u_matrix;
uniform bool u_flipV;
out vec2 v_uv;
void main() {
  v_uv = vec2(a_unit.x, u_flipV ? 1.0 - a_unit.y : a_unit.y);
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

export function createContext(
  canvas: HTMLCanvasElement | OffscreenCanvas,
  opts: { preserveDrawingBuffer?: boolean } = {},
): WebGL2RenderingContext {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    premultipliedAlpha: true,
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
  }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('WebGL2 is not available');
  return gl;
}

function compileShader(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type);
  if (!shader) throw new Error('Could not create shader');
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`Shader compile failed: ${log ?? 'unknown error'}`);
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
  const program = gl.createProgram();
  gl.attachShader(program, v);
  gl.attachShader(program, f);
  gl.linkProgram(program);
  // The program keeps the shaders alive while it needs them.
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`Program link failed: ${log ?? 'unknown error'}`);
  }
  return program;
}

/** A texture with linear filtering and clamped edges, ready for `uploadTexture`. */
export function createTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('Could not create texture');
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
  private readonly uFlipV: WebGLUniformLocation | null;
  private readonly uOpacity: WebGLUniformLocation | null;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.program = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER);
    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(this.program, 'a_unit');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    this.uMatrix = gl.getUniformLocation(this.program, 'u_matrix');
    this.uFlipV = gl.getUniformLocation(this.program, 'u_flipV');
    this.uOpacity = gl.getUniformLocation(this.program, 'u_opacity');
    gl.useProgram(this.program);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_tex'), 0);
  }

  /** Draws `tex` through `matrix` into the currently bound framebuffer/viewport. `flipV` for bottom-up textures (FBOs). */
  draw(tex: WebGLTexture, matrix: Mat3, opacity: number, flipV = false): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.uniformMatrix3fv(this.uMatrix, false, matrix);
    gl.uniform1i(this.uFlipV, flipV ? 1 : 0);
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

/** A colour-only framebuffer backed by a linearly filtered texture (used for the cheap blur background). */
export class RenderTarget {
  readonly slot: TextureSlot;
  private readonly gl: WebGL2RenderingContext;
  private readonly fbo: WebGLFramebuffer;

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    this.slot = { tex: createTexture(gl), width: 0, height: 0 };
    this.fbo = gl.createFramebuffer();
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
