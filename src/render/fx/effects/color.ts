// The Colour effect: the GLSL twin of colorPixel() in src/fx/reference.ts (same order, same constants).
import { HUE_ROTATE, LUMA709, SRGB, UNPREMULTIPLY } from '../glsl';
import { paramUniforms } from '../types';
import type { FxDef } from '../types';

const BODY = `uniform float u_exposure, u_brightness, u_contrast, u_saturation, u_hue, u_temperature, u_tint, u_shadows, u_highlights;
void main() {
  vec4 p = src(v_img);
  vec3 c = unpremul(p);
  if (u_exposure != 0.0) c = linearToSrgb(srgbToLinear(max(c, 0.0)) * exp2(u_exposure));
  float t = u_temperature * 0.1;
  c += vec3(t, -u_tint * 0.1, -t);
  c = (c + u_brightness * 0.5 - 0.5) * (1.0 + u_contrast) + 0.5;
  float l = clamp(dot(c, LUMA), 0.0, 1.0);
  c += u_shadows * 0.3 * (1.0 - l) * (1.0 - l) + u_highlights * 0.3 * l * l;
  c = mix(vec3(dot(c, LUMA)), c, 1.0 + u_saturation);
  if (u_hue != 0.0) c = hueRotate(c, u_hue);
  c = clamp(c, 0.0, 1.0);
  outColor = vec4(c * p.a, p.a);
}`;

export const colorFx: FxDef = {
  type: 'color',
  available: true,
  run(rc, src, params) {
    const prog = rc.program('color', [UNPREMULTIPLY, LUMA709, SRGB, HUE_ROTATE], BODY);
    return rc.onePass(prog, src, paramUniforms(params));
  },
};
