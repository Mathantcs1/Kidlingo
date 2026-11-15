// Chroma key: the GLSL twin of chromaPixel() in src/fx/reference.ts.
import { LUMA709, UNPREMULTIPLY } from '../glsl';
import type { FxDef } from '../types';

const BODY = `uniform vec3 u_key;
uniform float u_tolerance, u_softness, u_spill;
vec2 chromaOf(vec3 c) { float y = dot(c, LUMA); return vec2((c.b - y) / 1.8556, (c.r - y) / 1.5748); }
void main() {
  vec4 p = src(v_img);
  vec3 c = unpremul(p);
  float d = distance(chromaOf(c), chromaOf(u_key));
  float alpha = smoothstep(u_tolerance, u_tolerance + max(u_softness, 0.001), d);
  float kmax = max(u_key.r, max(u_key.g, u_key.b));
  vec3 mask = step(vec3(kmax - 0.0001), u_key);
  float dominant = mask.r + mask.g + mask.b;
  if (dominant < 1.5) {
    float own = dot(c, mask) / dominant;
    vec3 rest = c * (1.0 - mask);
    float excess = max(own - max(rest.r, max(rest.g, rest.b)), 0.0) * u_spill;
    c -= mask * excess;
  }
  float a = p.a * alpha;
  outColor = vec4(clamp(c, 0.0, 1.0) * a, a);
}`;

export const chromaFx: FxDef = {
  type: 'chroma',
  available: true,
  run(rc, src, params) {
    const prog = rc.program('chroma', [UNPREMULTIPLY, LUMA709], BODY);
    const k = params.key;
    return rc.onePass(prog, src, {
      u_key: [((k >> 16) & 255) / 255, ((k >> 8) & 255) / 255, (k & 255) / 255],
      u_tolerance: params.tolerance, u_softness: params.softness, u_spill: params.spill,
    });
  },
};
