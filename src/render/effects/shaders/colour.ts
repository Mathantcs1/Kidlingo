// The fused colour effect (Plan 4 D3): one pass, nine params. The maths and its order are documented in
// ../colourMath.ts, which also derives the uniforms; `colourPixel` there is the CPU reference of this shader.
import { LUMA, SRGB, colourCoeffs } from '../colourMath';
import type { PassShader } from '../types';

/** A GLSL float literal of `n` (always with a decimal point). */
const f = (n: number): string => (Number.isInteger(n) ? n.toFixed(1) : String(n));

export const COLOUR: PassShader = {
  fragment: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform float u_expo;
uniform vec3 u_wb;
uniform vec2 u_tone;
uniform float u_contrast;
uniform float u_bright;
uniform float u_sat;
uniform vec3 u_hue0;
uniform vec3 u_hue1;
uniform vec3 u_hue2;
out vec4 outColor;
const vec3 LUMA = vec3(${LUMA.map(f).join(', ')});

vec3 toLinear(vec3 c) {
  return mix(pow((c + ${f(SRGB.a)}) / ${f(1 + SRGB.a)}, vec3(${f(SRGB.gamma)})), c / ${f(SRGB.slope)},
    vec3(lessThan(c, vec3(${f(SRGB.encCut)}))));
}

vec3 toSrgb(vec3 l) {
  return mix(${f(1 + SRGB.a)} * pow(l, vec3(1.0 / ${f(SRGB.gamma)})) - ${f(SRGB.a)}, l * ${f(SRGB.slope)},
    vec3(lessThan(l, vec3(${f(SRGB.linCut)}))));
}

void main() {
  vec4 src = texture(u_src, v_uv);
  if (src.a <= 0.0) {
    outColor = vec4(0.0);
    return;
  }
  // Un-premultiply: the colour maths runs on straight colour, alpha is never touched.
  vec3 c = clamp(src.rgb / src.a, 0.0, 1.0);
  if (u_expo != 1.0) c = clamp(toSrgb(toLinear(c) * u_expo), 0.0, 1.0);
  c = clamp(c * u_wb, 0.0, 1.0);
  float l = dot(c, LUMA);
  c = clamp(c + u_tone.x * (1.0 - l) * (1.0 - l) + u_tone.y * l * l, 0.0, 1.0);
  if (u_contrast != 1.0) c = clamp((c - 0.5) * u_contrast + 0.5, 0.0, 1.0);
  c = clamp(c + u_bright, 0.0, 1.0);
  if (u_sat != 1.0) {
    float y = dot(c, LUMA);
    c = clamp(y + (c - y) * u_sat, 0.0, 1.0);
  }
  c = clamp(vec3(dot(u_hue0, c), dot(u_hue1, c), dot(u_hue2, c)), 0.0, 1.0);
  outColor = vec4(c * src.a, src.a);
}`,
  uniforms: (params) => {
    const k = colourCoeffs(params);
    return {
      u_expo: k.expo, u_wb: k.wb, u_tone: k.tone, u_contrast: k.contrast, u_bright: k.bright, u_sat: k.sat,
      u_hue0: k.hue[0], u_hue1: k.hue[1], u_hue2: k.hue[2],
    };
  },
};
