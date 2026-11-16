// The GL side of the transition pass (Plan 5C Task 5): compiles the transition program once and draws one fullscreen pass.
import type { TransitionDirection } from '../core/transitionTypes';
import { PASS_VERTEX } from './effects/programs';
import { createUnitQuad } from './effects/passResources';
import { TRANSITION_FRAGMENT, TRANSITION_TYPE_INDEX } from './effects/shaders/transition';
import { createProgram } from './gl';
import type { TransitionParams } from './transitionMath';

const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const DIR_INDEX: Record<TransitionDirection, number> = { left: 0, right: 1, up: 2, down: 3 };

export class TransitionProgram {
  private readonly program: WebGLProgram;
  private readonly vao: WebGLVertexArrayObject;
  private readonly buffer: WebGLBuffer;
  private readonly at = new Map<string, WebGLUniformLocation | null>();

  /** Throws like createProgram when the shader cannot be compiled. */
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.program = createProgram(gl, PASS_VERTEX, TRANSITION_FRAGMENT);
    try {
      ({ vao: this.vao, buffer: this.buffer } = createUnitQuad(gl));
    } catch (e) {
      gl.deleteProgram(this.program);
      throw e;
    }
    gl.useProgram(this.program);
    gl.uniform1i(this.loc('u_backdrop'), 0);
    gl.uniform1i(this.loc('u_a'), 1);
    gl.uniform1i(this.loc('u_b'), 2);
  }

  private loc(name: string): WebGLUniformLocation | null {
    if (!this.at.has(name)) this.at.set(name, this.gl.getUniformLocation(this.program, name));
    return this.at.get(name) ?? null;
  }

  /** Draws the transition of layers `a` and `b` into the bound target; `backdrop` (non-null) makes it premultiplied-over that. */
  draw(prm: TransitionParams, a: WebGLTexture, b: WebGLTexture, backdrop: WebGLTexture | null): void {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    const bind = (unit: number, tex: WebGLTexture | null): void => {
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    };
    bind(2, b);
    bind(1, a);
    bind(0, backdrop ?? a);
    gl.uniformMatrix3fv(this.loc('u_uv'), false, IDENTITY);
    gl.uniform1i(this.loc('u_type'), TRANSITION_TYPE_INDEX[prm.type]);
    gl.uniform1i(this.loc('u_dir'), DIR_INDEX[prm.direction]);
    gl.uniform1i(this.loc('u_over'), backdrop ? 1 : 0);
    gl.uniform1i(this.loc('u_frame'), prm.frame);
    gl.uniform1f(this.loc('u_e'), prm.e);
    gl.uniform1f(this.loc('u_softness'), prm.softness);
    gl.uniform1f(this.loc('u_amount'), prm.amount);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    bind(2, null);
    bind(1, null);
    bind(0, null);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
    this.gl.deleteVertexArray(this.vao);
    this.gl.deleteBuffer(this.buffer);
  }
}
