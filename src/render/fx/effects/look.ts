// One-click looks: the GLSL twin of lookPixel() plus the look's vignette and grain (data in src/fx/looks.ts).
import { LOOK_KEYS, lookParams } from '../../../fx/looks';
import { HASH, LUMA709, UNPREMULTIPLY } from '../glsl';
import { seedVec } from '../seed';
import type { FxDef } from '../types';

const BODY = `uniform vec3 u_lift, u_gamma, u_gain;
uniform float u_sat, u_contrast, u_fade, u_vignette, u_grain, u_grainSize;
uniform vec2 u_seed;
void main() {
  vec4 p = src(v_img);
  vec3 c = unpremul(p);
  c *= u_gain;
  c += u_lift * (1.0 - c);
  c = pow(max(c, 0.0), vec3(1.0) / u_gamma);
  c = (c - 0.5) * u_contrast + 0.5;
  c = mix(vec3(dot(c, LUMA)), c, u_sat);
  c = clamp(u_fade + c * (1.0 - u_fade), 0.0, 1.0);
  float d = length((v_img - 0.5) * 2.0) / 1.41421356;
  c *= 1.0 - 0.9 * u_vignette * smoothstep(0.6, 0.88, d);
  if (u_grain > 0.0) {
    vec2 cell = floor(v_img / (max(u_grainSize, 1.0) * u_texel)) + u_seed;
    vec3 n = vec3(hash21(cell), hash21(cell + vec2(17.0, 31.0)), hash21(cell + vec2(53.0, 7.0))) - 0.5;
    n = mix(vec3(n.x), n, 0.3);
    float l = dot(c, LUMA);
    c = clamp(c + n * u_grain * (1.0 - 0.5 * pow(abs(2.0 * l - 1.0), 2.0)), 0.0, 1.0);
  }
  outColor = vec4(clamp(c, 0.0, 1.0) * p.a, p.a);
}`;

export const lookFx: FxDef = {
  type: 'look',
  available: true,
  run(rc, src, params) {
    const prog = rc.program('look', [UNPREMULTIPLY, LUMA709, HASH], BODY);
    const g = lookParams(LOOK_KEYS[params.preset] ?? LOOK_KEYS[0], params.intensity);
    return rc.onePass(prog, src, {
      u_lift: g.lift, u_gamma: g.gamma, u_gain: g.gain, u_sat: g.saturation, u_contrast: g.contrast, u_fade: g.fade,
      u_vignette: g.vignette, u_grain: g.grain, u_grainSize: 1.5 * rc.info.pxScale, u_seed: seedVec(rc.info.seed),
    });
  },
};
