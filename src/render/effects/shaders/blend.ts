// The GLSL twin of ../../blend.ts (blendChannel / blendPixel / adjustPixel): the composite pass of a non-normal clip, or of any
// layer handed to CompositeBuffer.blend. Mode numbers and constants come from the TS module (single source).
import { BLEND_MODES } from '../../../core/videoEffects';
import { BLEND_MODE_INDEX, SOFT_LIGHT_KNEE } from '../../blend';
import { GLSL_PREMULTIPLY, f } from './glsl';

const constName = (mode: string): string => `MODE_${mode.replace(/[A-Z]/g, (c) => `_${c}`).toUpperCase()}`;

/** `const int MODE_MULTIPLY = 1;` … one per BlendMode, numbered by BLEND_MODE_INDEX. */
export const GLSL_BLEND_MODES = BLEND_MODES.map((m) => `const int ${constName(m)} = ${BLEND_MODE_INDEX[m]};`).join('\n');

/**
 * Samples the backdrop (the composite so far, `u_backdrop`, unit 0) and the layer (`u_layer`, unit 1, through
 * `u_layerUv`, scaled by `u_opacity`) at the same place and writes blendPixel(u_mode, backdrop, layer); with
 * `u_adjust` 1 (an adjustment layer) it writes adjustPixel(u_mode, backdrop, layer, u_opacity) instead. Uses the pass
 * vertex shader (PASS_VERTEX) with an identity u_uv, so v_uv covers the target.
 */
export const BLEND_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_backdrop;
uniform sampler2D u_layer;
uniform mat3 u_layerUv;
uniform int u_mode;
uniform float u_opacity;
uniform int u_adjust;
out vec4 outColor;
${GLSL_BLEND_MODES}
${GLSL_PREMULTIPLY}

float screenCh(float b, float s) { return b + s - b * s; }
float hardLightCh(float b, float s) { return s <= 0.5 ? b * 2.0 * s : screenCh(b, 2.0 * s - 1.0); }

float softLightCh(float b, float s) {
  if (s <= 0.5) return b - (1.0 - 2.0 * s) * b * (1.0 - b);
  float d = b <= ${f(SOFT_LIGHT_KNEE)} ? ((16.0 * b - 12.0) * b + 4.0) * b : sqrt(b);
  return b + (2.0 * s - 1.0) * (d - b);
}

float blendChannel(int mode, float b, float s) {
  if (mode == MODE_MULTIPLY) return b * s;
  if (mode == MODE_SCREEN) return screenCh(b, s);
  if (mode == MODE_OVERLAY) return hardLightCh(s, b);
  if (mode == MODE_DARKEN) return min(b, s);
  if (mode == MODE_LIGHTEN) return max(b, s);
  if (mode == MODE_COLOUR_DODGE) return b == 0.0 ? 0.0 : s >= 1.0 ? 1.0 : min(1.0, b / (1.0 - s));
  if (mode == MODE_COLOUR_BURN) return b >= 1.0 ? 1.0 : s == 0.0 ? 0.0 : 1.0 - min(1.0, (1.0 - b) / s);
  if (mode == MODE_HARD_LIGHT) return hardLightCh(b, s);
  if (mode == MODE_SOFT_LIGHT) return softLightCh(b, s);
  if (mode == MODE_DIFFERENCE) return abs(b - s);
  if (mode == MODE_EXCLUSION) return b + s - 2.0 * b * s;
  return s;
}

void main() {
  vec4 bd = texture(u_backdrop, v_uv);
  vec4 layer = texture(u_layer, (u_layerUv * vec3(v_uv, 1.0)).xy);
  vec4 src = u_adjust == 1 ? layer : layer * u_opacity;
  vec3 cb = unpremultiply(bd);
  vec3 cs = unpremultiply(src);
  vec3 mixed = vec3(blendChannel(u_mode, cb.r, cs.r), blendChannel(u_mode, cb.g, cs.g), blendChannel(u_mode, cb.b, cs.b));
  if (u_adjust == 1) {
    // adjustPixel: the processed picture replaces the backdrop, then the backdrop is lerped towards it by opacity.
    float w = src.a > 0.0 ? min(1.0, bd.a / src.a) : 0.0;
    outColor = mix(bd, premultiply(mix(cs, mixed, w), src.a), u_opacity);
    return;
  }
  vec3 rgb = src.rgb * (1.0 - bd.a) + bd.rgb * (1.0 - src.a) + src.a * bd.a * mixed;
  outColor = vec4(rgb, src.a + bd.a * (1.0 - src.a));
}`;
