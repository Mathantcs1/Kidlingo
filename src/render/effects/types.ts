// The contract between the effect pipeline and the per-effect shader modules (Tasks 4-9 add one module each).
import type { Id, VideoEffect, VideoEffectType } from '../../core/model';
import type { Size } from '../geometry';

/** Everything an effect may depend on besides its params: deterministic from (project, time). */
export interface EffectContext {
  /** Clip-relative seconds (timeline time − clip start) snapped to the frame start: `snapToFrame`. */
  time: number;
  /** The clip-relative frame index: `frameIndex` (time === frame / fps). */
  frame: number;
  fps: number;
  /**
   * The loaded LUT of a LUT media id (Task 6), or null when it is missing, unreadable or not a LUT. Synchronous: the
   * compositor loads every visible clip's LUTs in Phase 1, before any pass runs.
   */
  lut(ref: Id): LoadedLut | null;
  /** Called once per effect type per session when its program fails to compile or link (D8). */
  onUnavailable(type: VideoEffectType): void;
}

/** A LUT uploaded as a TEXTURE_3D (width = red, height = green, depth = blue), with its .cube domain. */
export interface LoadedLut {
  texture: WebGLTexture;
  size: number;
  domainMin: [number, number, number];
  domainMax: [number, number, number];
}

/** An extra texture a pass samples besides u_src: `target` is the bind target (a LUT is a TEXTURE_3D). */
export interface PassTexture {
  target: 'TEXTURE_2D' | 'TEXTURE_3D';
  texture: WebGLTexture;
}

/** What `PassShader.inputs` supplies for one effect: sampler uniform name → texture, plus extra float/vec uniforms. */
export interface PassInputs {
  textures: Record<string, PassTexture>;
  uniforms?: Uniforms;
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
   * vec2/vec3/vec4 uniforms are supported (a number or an array of 2-4 numbers); no int, bool or matrix uniforms,
   * and samplers only through `inputs`. Anything else, or a throw, turns the effect off for the session (D8).
   * tests/effect-pipeline-run.test.ts checks the test shaders against this.
   */
  uniforms(params: Record<string, number>, ctx: EffectContext, size: Size): Uniforms;
  /**
   * Extra inputs of the effect (Task 6, e.g. the LUT of `effect.ref`), called once per frame before its passes.
   * Each texture is bound to texture unit 1, 2, … (in key order; unit 0 is u_src) for every pass of the effect, its
   * sampler uniform is set to that unit, and it is unbound again after each pass. `uniforms` are merged into every
   * pass's own uniforms. Return null when an input is not available (a missing LUT): the effect is skipped for this
   * frame, without a pass and WITHOUT being turned off (the caller reports why). Shaders without inputs omit it.
   */
  inputs?(effect: Readonly<VideoEffect>, ctx: EffectContext): PassInputs | null;
  /**
   * Multi-pass override (e.g. separable blur): call `pass.draw` once per pass. Without it the pipeline draws one
   * pass with `uniforms(...)`. Drawing no pass leaves the picture unchanged.
   */
  run?(pass: PassRunner, params: Record<string, number>, ctx: EffectContext, size: Size): void;
}
