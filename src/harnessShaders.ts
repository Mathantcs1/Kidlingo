// Test-only effect shaders for the dev harness and unit tests (never registered by the app, never shipped).
import { PASSTHROUGH } from './render/effects/shaders/passthrough';
import type { PassShader } from './render/effects/types';

const fragment = (body: string, decls = ''): string => `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform float u_time;
uniform float u_frame;
${decls}
out vec4 outColor;
void main() {
  vec4 c = texture(u_src, v_uv);
  ${body}
}`;

/** Premultiplied invert: un-premultiplied 1 − rgb, times alpha, is alpha − rgb. */
const INVERT: PassShader = { fragment: fragment('outColor = vec4(c.a - c.rgb, c.a);'), uniforms: () => ({}) };

/** Called by the `loseMidway` shader between its two passes (the harness sets it to lose the GL context). */
let midwayHook: () => void = () => undefined;
export function setMidwayHook(hook: () => void): void {
  midwayHook = hook;
}

export const TEST_SHADERS = {
  passthrough: PASSTHROUGH,
  invert: INVERT,
  /** Two passes of the invert program through the multi-pass hook: output = input, 2 passes. */
  invertTwice: { ...INVERT, run: (pass) => { pass.draw({}); pass.draw({}); } } as PassShader,
  /** Scales the picture by params.amount through a custom uniform. */
  gain: { fragment: fragment('outColor = c * u_gain;', 'uniform float u_gain;'), uniforms: (p) => ({ u_gain: p.amount }) } as PassShader,
  /** Writes the clip-relative frame index (red) and snapped time × 30 (green) in 1/255 steps. */
  frame: { fragment: fragment('outColor = vec4(u_frame / 255.0, u_time * 30.0 / 255.0, 0.0, 1.0);'), uniforms: () => ({}) } as PassShader,
  /** Does not compile. */
  broken: { fragment: '#version 300 es\nthis is not glsl;', uniforms: () => ({}) } as PassShader,
  /** Compiles, but its params → uniforms mapping throws. */
  throwing: { ...INVERT, uniforms: () => { throw new Error('test effect: uniforms() failed'); } } as PassShader,
  /** Draws one invert pass, then throws half way through its multi-pass run. */
  throwsMidway: { ...INVERT, run: (pass) => { pass.draw({}); throw new Error('test effect: failed half way'); } } as PassShader,
  /** Returns a uniform vector of an unsupported length. */
  badVector: { ...INVERT, uniforms: () => ({ u_bad: [1, 2, 3, 4, 5] }) } as PassShader,
  /** Two invert passes with the midway hook (a context loss) between them. */
  loseMidway: { ...INVERT, run: (pass) => { pass.draw({}); midwayHook(); pass.draw({}); } } as PassShader,
} satisfies Record<string, PassShader>;

export type TestShader = keyof typeof TEST_SHADERS;
