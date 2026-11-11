// Per-effect GL programs: the shader registry, lazy compilation and the session-wide failure policy (D8).
import type { VideoEffectType } from '../../core/model';
import type { Mat3, Size } from '../geometry';
import { createProgram } from '../gl';
import { BLUR, GLOW, PIXELATE, SHARPEN } from './shaders/blurFamily';
import { COLOUR } from './shaders/colour';
import { BW, GRAIN, SEPIA, SPLIT_TONE, VIGNETTE } from './shaders/look';
import { LUT } from './shaders/lut';
import type { EffectContext, PassShader, PassTexture, UniformValue, Uniforms } from './types';

/**
 * The shader of each available effect. Each effect task adds its entry here (from its own module under ./shaders)
 * when it flips `VIDEO_EFFECTS[type].available`; a type without an entry is skipped by the pipeline.
 */
export const PASS_SHADERS: Partial<Record<VideoEffectType, PassShader>> = {
  colour: COLOUR,
  bw: BW,
  sepia: SEPIA,
  splitTone: SPLIT_TONE,
  vignette: VIGNETTE,
  grain: GRAIN,
  lut: LUT,
  blur: BLUR,
  sharpen: SHARPEN,
  glow: GLOW,
  pixelate: PIXELATE,
};

/** Registers (or, with undefined, removes) a type's shader. Used by tests and the dev harness's test-only effects. */
export function registerPassShader(type: VideoEffectType, shader: PassShader | undefined): void {
  if (shader) PASS_SHADERS[type] = shader;
  else delete PASS_SHADERS[type];
  failedTypes.delete(type);
}

/** The compositor's message for a lost context (the preview and exporter match it). */
export const CONTEXT_LOST = 'WebGL context lost';

/** Throws Error(CONTEXT_LOST) when `gl` is lost. */
export function assertNotLost(gl: WebGL2RenderingContext): void {
  if (gl.isContextLost()) throw new Error(CONTEXT_LOST);
}

/** The vertex shader of every pass: the unit quad over the whole target, unflipped, so v_uv.v = 0 is the top. */
export const PASS_VERTEX = `#version 300 es
layout(location = 0) in vec2 a_unit;
uniform mat3 u_uv;
out vec2 v_uv;
void main() {
  v_uv = (u_uv * vec3(a_unit, 1.0)).xy;
  gl_Position = vec4(a_unit * 2.0 - 1.0, 0.0, 1.0);
}`;

/**
 * A compiled effect program. Draws one fullscreen pass into the bound framebuffer with the unit quad VAO bound;
 * `textures` (PassShader.inputs) are bound to units 1.. for that pass only.
 */
export interface PassProgram {
  readonly shader: PassShader;
  draw(src: WebGLTexture, uv: Mat3, uniforms: Uniforms, size: Size, ctx: EffectContext, textures?: Record<string, PassTexture>): void;
  dispose(): void;
}

type UniformSetter = 'uniform1f' | 'uniform1fv' | 'uniform2fv' | 'uniform3fv' | 'uniform4fv';

/** The setter for a uniform value (pure; exported for tests): a Float32Array is a float array. */
export function uniformCall(v: UniformValue): [UniformSetter, UniformValue] {
  if (typeof v === 'number') return ['uniform1f', v];
  if (v instanceof Float32Array) return ['uniform1fv', v];
  const setters: Record<number, UniformSetter> = { 2: 'uniform2fv', 3: 'uniform3fv', 4: 'uniform4fv' };
  const setter = setters[v.length];
  if (!setter) throw new Error(`Unsupported uniform of length ${v.length}`);
  return [setter, v];
}

class GlPassProgram implements PassProgram {
  private readonly locations = new Map<string, WebGLUniformLocation | null>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly program: WebGLProgram,
    readonly shader: PassShader,
  ) {
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, 'u_src'), 0);
  }

  private at(name: string): WebGLUniformLocation | null {
    if (!this.locations.has(name)) this.locations.set(name, this.gl.getUniformLocation(this.program, name));
    return this.locations.get(name) ?? null;
  }

  draw(src: WebGLTexture, uv: Mat3, uniforms: Uniforms, size: Size, ctx: EffectContext, textures: Record<string, PassTexture> = {}): void {
    const gl = this.gl;
    gl.useProgram(this.program);
    const extra = Object.entries(textures);
    // Without its texture, a declared u_input sampler reads unit 0 (u_src), never a stale unit (feedback loop).
    if (!('u_input' in textures)) gl.uniform1i(this.at('u_input'), 0);
    for (const [i, [name, t]] of extra.entries()) {
      gl.activeTexture(gl.TEXTURE1 + i);
      gl.bindTexture(gl[t.target], t.texture);
      gl.uniform1i(this.at(name), i + 1);
    }
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, src);
    gl.uniformMatrix3fv(this.at('u_uv'), false, uv);
    gl.uniform2f(this.at('u_size'), size.width, size.height);
    gl.uniform1f(this.at('u_time'), ctx.time);
    gl.uniform1f(this.at('u_frame'), ctx.frame);
    for (const [name, value] of Object.entries(uniforms)) {
      const [setter, v] = uniformCall(value);
      if (setter === 'uniform1f') gl.uniform1f(this.at(name), v as number);
      else gl[setter](this.at(name), v as Float32Array);
    }
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    if (extra.length === 0) return;
    for (const [i, [, t]] of extra.entries()) {
      gl.activeTexture(gl.TEXTURE1 + i);
      gl.bindTexture(gl[t.target], null);
    }
    gl.activeTexture(gl.TEXTURE0);
  }

  dispose(): void {
    this.gl.deleteProgram(this.program);
  }
}

/** Compiled programs per context; a shader that failed is off for the whole session (every context, D8). */
const compiled = new WeakMap<WebGL2RenderingContext, Map<PassShader, PassProgram>>();
const failed = new WeakSet<PassShader>();
const failedTypes = new Set<VideoEffectType>();

/** Every effect type turned off this session (compile/link or run-time failure), in failure order (D8). */
export function unavailableTypes(): VideoEffectType[] {
  return [...failedTypes];
}

/**
 * Turns `type`'s current shader off for the session after a failure that is not a lost context, and calls
 * `onUnavailable(type)` (only the first time that shader fails).
 */
export function markUnavailable(
  type: VideoEffectType,
  shader: PassShader,
  onUnavailable: (type: VideoEffectType) => void,
  error: unknown,
): void {
  if (failed.has(shader)) return;
  failed.add(shader);
  if (PASS_SHADERS[type] === shader) failedTypes.add(type);
  console.warn(`Effect '${type}' is unavailable:`, error);
  onUnavailable(type);
}

/**
 * The program of `type`'s registered shader, compiled on first use. Returns null when no shader is registered, or
 * when it failed to compile/link (now or earlier in the session): `onUnavailable(type)` is called only at that first
 * failure. A lost context is not a shader failure: it throws 'WebGL context lost' and caches nothing.
 */
export function programFor(
  gl: WebGL2RenderingContext,
  type: VideoEffectType,
  onUnavailable: (type: VideoEffectType) => void,
): PassProgram | null {
  const shader = PASS_SHADERS[type];
  if (!shader || failed.has(shader)) return null;
  let programs = compiled.get(gl);
  const hit = programs?.get(shader);
  if (hit) return hit;
  let program: WebGLProgram;
  try {
    program = createProgram(gl, PASS_VERTEX, shader.fragment);
  } catch (e) {
    assertNotLost(gl);
    markUnavailable(type, shader, onUnavailable, e);
    return null;
  }
  if (!programs) {
    programs = new Map();
    compiled.set(gl, programs);
  }
  const pass = new GlPassProgram(gl, program, shader);
  programs.set(shader, pass);
  return pass;
}

/** Deletes every effect program compiled for `gl` (the compositor's dispose). */
export function disposePrograms(gl: WebGL2RenderingContext): void {
  for (const p of compiled.get(gl)?.values() ?? []) p.dispose();
  compiled.delete(gl);
}
