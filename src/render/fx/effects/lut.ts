// 3D LUT grading with trilinear lookup (half-texel remap) and an intensity mix. A missing/unloadable LUT is skipped.
import { UNPREMULTIPLY } from '../glsl';
import type { FxDef } from '../types';

const BODY = `precision highp sampler3D;
uniform sampler3D u_lut;
uniform float u_intensity, u_size;
uniform vec3 u_dmin, u_dscale;
void main() {
  vec4 p = src(v_img);
  vec3 c = unpremul(p);
  vec3 q = clamp((c - u_dmin) * u_dscale, 0.0, 1.0);
  vec3 graded = texture(u_lut, q * ((u_size - 1.0) / u_size) + 0.5 / u_size).rgb;
  c = mix(c, graded, u_intensity);
  outColor = vec4(clamp(c, 0.0, 1.0) * p.a, p.a);
}`;

export const lutFx: FxDef = {
  type: 'lut',
  available: true,
  run(rc, src, params, fx) {
    const prog = rc.program('lut', [UNPREMULTIPLY], BODY);
    const lut = rc.luts.peek(fx.ref);
    if (!lut || params.intensity <= 0) return src;
    const dst = rc.pool.acquire(src.width, src.height);
    rc.pass.draw(prog, src, dst, {
      u_intensity: params.intensity, u_size: lut.size, u_dmin: lut.domainMin, u_dscale: lut.domainScale,
    }, [], lut.tex);
    rc.pool.release(src);
    return dst;
  },
};
