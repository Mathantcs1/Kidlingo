// The .cube LUT effect (Plan 4 D5): one pass sampling the LUT media's TEXTURE_3D trilinearly. `lutPixel` in
// ../lutMath.ts is its CPU reference (same domain normalisation and half-texel coordinate).
import { lutDomain } from '../lutMath';
import type { PassShader } from '../types';
import { GLSL_HEADER, GLSL_PREMULTIPLY } from './glsl';

export const LUT: PassShader = {
  fragment: `${GLSL_HEADER}
uniform highp sampler3D u_lut;
uniform vec3 u_dmin;
uniform vec3 u_dscale;
uniform float u_intensity;
${GLSL_PREMULTIPLY}

void main() {
  vec4 src = texture(u_src, v_uv);
  vec3 c = unpremultiply(src);
  float n = float(textureSize(u_lut, 0).x);
  vec3 x = clamp((c - u_dmin) * u_dscale, 0.0, 1.0);
  // Half-texel correction (lutCoord): lattice point 0 is the centre of the first texel, n-1 of the last.
  vec3 graded = texture(u_lut, (x * (n - 1.0) + 0.5) / n).rgb;
  outColor = premultiply(clamp(mix(c, graded, u_intensity), 0.0, 1.0), src.a);
}`,
  uniforms: (params) => ({ u_intensity: params.intensity }),
  inputs: (effect, ctx) => {
    const lut = effect.ref === undefined ? null : ctx.lut(effect.ref);
    if (!lut) return null;
    const { min, scale } = lutDomain(lut);
    return { textures: { u_lut: { target: 'TEXTURE_3D', texture: lut.texture } }, uniforms: { u_dmin: min, u_dscale: scale } };
  },
};
