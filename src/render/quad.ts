// The textured-quad renderer (re-exported by gl.ts): one program, one VAO over a unit square.
import type { Mat3 } from './geometry';
import { createProgram } from './glProgram';
import { GlUnavailableError } from './glErrors';

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
