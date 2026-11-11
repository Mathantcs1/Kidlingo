// The fused colour effect (Plan 4 D3): one pass, nine params. The maths and its order are documented in
// ../colourMath.ts, which also derives the uniforms; `colourPixel` there is the CPU reference of this shader.
import { colourCoeffs } from '../colourMath';
import type { PassShader } from '../types';
import { GLSL_HEADER, GLSL_LUMA, GLSL_PREMULTIPLY, GLSL_SRGB } from './glsl';

export const COLOUR: PassShader = {
  fragment: `${GLSL_HEADER}
uniform float u_expo;
uniform vec3 u_wb;
uniform vec2 u_tone;
uniform float u_contrast;
uniform float u_bright;
uniform float u_sat;
uniform vec3 u_hue0;
uniform vec3 u_hue1;
uniform vec3 u_hue2;
${GLSL_LUMA}
${GLSL_SRGB}
${GLSL_PREMULTIPLY}

void main() {
  vec4 src = texture(u_src, v_uv);
  // The colour maths runs on straight colour; alpha is never touched.
  vec3 c = unpremultiply(src);
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
  outColor = premultiply(c, src.a);
}`,
  uniforms: (params) => {
    const k = colourCoeffs(params);
    return {
      u_expo: k.expo, u_wb: k.wb, u_tone: k.tone, u_contrast: k.contrast, u_bright: k.bright, u_sat: k.sat,
      u_hue0: k.hue[0], u_hue1: k.hue[1], u_hue2: k.hue[2],
    };
  },
};
