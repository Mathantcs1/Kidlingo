// Fullscreen shader passes between pooled targets, and the lazily compiled program cache.
import { createProgram } from '../gl';
import { GlUnavailableError } from '../glErrors';
import { VERTEX } from './glsl';
import type { Target } from './pool';

export type Uniforms = Record<string, number | number[]>;

export class FxProgram {
  readonly program: WebGLProgram;
  private readonly locs = new Map<string, WebGLUniformLocation | null>();

  constructor(private readonly gl: WebGL2RenderingContext, fragmentSource: string) {
    this.program = createProgram(gl, VERTEX, fragmentSource);
    gl.useProgram(this.program);
    gl.uniform1i(this.loc('u_tex'), 0);
  }

  loc(name: string): WebGLUniformLocation | null {
    if (!this.locs.has(name)) this.locs.set(name, this.gl.getUniformLocation(this.program, name));
    return this.locs.get(name) ?? null;
  }
}

/** Compiles each effect shader on first use; a failure throws GlUnavailableError('shader') for that key only. */
export class FxPrograms {
  private readonly map = new Map<string, FxProgram>();

  constructor(private readonly gl: WebGL2RenderingContext) {}

  get(key: string, build: () => string): FxProgram {
    let p = this.map.get(key);
    if (!p) {
      p = new FxProgram(this.gl, build());
      this.map.set(key, p);
    }
    return p;
  }

  dispose(): void {
    for (const p of this.map.values()) this.gl.deleteProgram(p.program);
    this.map.clear();
  }
}

/** Draws a unit quad over the whole of `dst`, sampling `src`; blending is off so the pass overwrites. */
export class FullscreenPass {
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;

  constructor(private readonly gl: WebGL2RenderingContext) {
    const vao = gl.createVertexArray() as WebGLVertexArrayObject | null;
    const buffer = gl.createBuffer() as WebGLBuffer | null;
    if (!vao || !buffer) throw new GlUnavailableError('resource', 'Could not create the effect quad');
    this.vao = vao;
    this.buffer = buffer;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
  }

  /** `extra` targets are bound to texture units 1.. as `u_tex1`.. (read with `src1()` in the shader); `lut3d` to unit 5 as `u_lut`. */
  draw(prog: FxProgram, src: Target, dst: Target, uniforms: Uniforms, extra: Target[] = [], lut3d?: WebGLTexture): void {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fbo);
    gl.viewport(0, 0, dst.width, dst.height);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.useProgram(prog.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src.slot.tex);
    extra.forEach((t, i) => {
      gl.activeTexture(gl.TEXTURE1 + i);
      gl.bindTexture(gl.TEXTURE_2D, t.slot.tex);
      gl.uniform1i(prog.loc(`u_tex${i + 1}`), i + 1);
    });
    if (lut3d) {
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_3D, lut3d);
      gl.uniform1i(prog.loc('u_lut'), 5);
    }
    gl.activeTexture(gl.TEXTURE0);
    const texel = prog.loc('u_texel');
    if (texel) gl.uniform2f(texel, 1 / src.width, 1 / src.height);
    for (const [name, v] of Object.entries(uniforms)) {
      const loc = prog.loc(name);
      if (!loc) continue;
      if (typeof v === 'number') gl.uniform1f(loc, v);
      else if (v.length === 2) gl.uniform2fv(loc, v);
      else if (v.length === 3) gl.uniform3fv(loc, v);
      else gl.uniform4fv(loc, v);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
  }

  dispose(): void {
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.buffer);
  }
}
