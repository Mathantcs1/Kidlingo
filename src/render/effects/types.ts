// The contract between the effect pipeline and the per-effect shader modules (Tasks 4-9 add one module each).
import type { Id, VideoEffectType } from '../../core/model';
import type { Size } from '../geometry';

/** Everything an effect may depend on besides its params: deterministic from (project, time). */
export interface EffectContext {
  /** Clip-relative seconds (timeline time − clip start) snapped to the frame start: `snapToFrame`. */
  time: number;
  /** The clip-relative frame index: `frameIndex` (time === frame / fps). */
  frame: number;
  fps: number;
  /** The 3D texture of a LUT media (Task 6), or null when it is not loaded. */
  lut(ref: Id): WebGLTexture | null;
  /** Called once per effect type per session when its program fails to compile or link (D8). */
  onUnavailable(type: VideoEffectType): void;
}

/** A uniform value: a float, or a vec2/vec3/vec4. */
export type UniformValue = number | number[];
export type Uniforms = Record<string, UniformValue>;

/** Runs extra passes of the same program (multi-pass effects, see PassShader.run). */
export interface PassRunner {
  /**
   * Draws one fullscreen pass of the effect's program with `uniforms` (plus the standard ones), sampling the current
   * source and writing the next ping-pong target, which then becomes the source.
   */
  draw(uniforms: Uniforms): void;
}

/**
 * One effect's shader. `fragment` is a complete GLSL ES 3.00 fragment shader that receives:
 *   in vec2 v_uv;            texture coordinate of the source, v = 0 at the TOP of the picture
 *   uniform sampler2D u_src; the source (premultiplied alpha; un-premultiply before colour maths)
 *   uniform vec2 u_size;     the working size in pixels (texel = 1.0 / u_size)
 *   uniform float u_time;    EffectContext.time;  uniform float u_frame: EffectContext.frame
 * and writes `out vec4 outColor` (premultiplied). gl_FragCoord.y also grows downwards in the picture.
 */
export interface PassShader {
  fragment: string;
  /**
   * The effect's own uniforms for a single pass (params are already clamped by the data layer). ONLY float and
   * vec2/vec3/vec4 uniforms are supported (a number or an array of 2-4 numbers); no int, bool, matrix or sampler
   * uniforms (an extra texture such as a LUT needs a pipeline hook, Task 6). Anything else, or a throw, turns the
   * effect off for the session (D8). tests/effect-pipeline-run.test.ts checks the test shaders against this.
   */
  uniforms(params: Record<string, number>, ctx: EffectContext, size: Size): Uniforms;
  /**
   * Multi-pass override (e.g. separable blur): call `pass.draw` once per pass. Without it the pipeline draws one
   * pass with `uniforms(...)`. Drawing no pass leaves the picture unchanged.
   */
  run?(pass: PassRunner, params: Record<string, number>, ctx: EffectContext, size: Size): void;
}
