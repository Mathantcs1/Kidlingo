// GLSL snippets shared by the effect shaders (Plan 4 Tasks 4-9), written from the TS constants of colourMath.ts so
// each shader and its CPU reference use the same numbers. Paste them into a fragment shader with ${...}.
import { LUMA, SRGB } from '../colourMath';

/** A GLSL float literal of `n` (always with a decimal point). */
export const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

/** The standard declarations of every pass (see PassShader in ../types.ts). */
export const GLSL_HEADER = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
out vec4 outColor;`;

/** `LUMA`: the Rec.709 luma weights. */
export const GLSL_LUMA = `const vec3 LUMA = vec3(${LUMA.map(f).join(', ')});`;

/** `toLinear(vec3)` / `toSrgb(vec3)`: the piecewise sRGB transfer functions (srgbToLinear / linearToSrgb). */
export const GLSL_SRGB = `
vec3 toLinear(vec3 c) {
  return mix(pow((c + ${f(SRGB.a)}) / ${f(1 + SRGB.a)}, vec3(${f(SRGB.gamma)})), c / ${f(SRGB.slope)},
    vec3(lessThan(c, vec3(${f(SRGB.encCut)}))));
}

vec3 toSrgb(vec3 l) {
  return mix(${f(1 + SRGB.a)} * pow(l, vec3(1.0 / ${f(SRGB.gamma)})) - ${f(SRGB.a)}, l * ${f(SRGB.slope)},
    vec3(lessThan(l, vec3(${f(SRGB.linCut)}))));
}`;

/**
 * `unpremultiply(vec4)`: the straight colour (clamped 0..1; black where alpha is 0) of a premultiplied texel, and
 * `premultiply(vec3, float)`: back to premultiplied RGBA. Effects do their colour maths between the two and pass alpha
 * through unchanged (no dark/bright fringes on soft edges).
 */
export const GLSL_PREMULTIPLY = `
vec3 unpremultiply(vec4 p) {
  return p.a > 0.0 ? clamp(p.rgb / p.a, 0.0, 1.0) : vec3(0.0);
}

vec4 premultiply(vec3 c, float a) {
  return vec4(c * a, a);
}`;
