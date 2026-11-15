// Black & white, sepia, invert and vignette: GLSL twins of bwPixel/sepiaPixel/invertPixel/vignetteFactor.
import { LUMA709, UNPREMULTIPLY } from '../glsl';
import { paramUniforms } from '../types';
import type { FxDef } from '../types';
import type { FxType } from '../../../core/model';

const unpremultiplied = (type: FxType, chunks: string[], math: string): FxDef => {
  const body = `uniform float u_amount;
void main() {
  vec4 p = src(v_img);
  vec3 c = unpremul(p);
${math}
  outColor = vec4(clamp(c, 0.0, 1.0) * p.a, p.a);
}`;
  return {
    type,
    available: true,
    run: (rc, src, params) => rc.onePass(rc.program(type, [UNPREMULTIPLY, ...chunks], body), src, paramUniforms(params)),
  };
};

export const bwFx = unpremultiplied('bw', [LUMA709], '  c = mix(c, vec3(dot(c, LUMA)), u_amount);');
export const sepiaFx = unpremultiplied('sepia', [], `  vec3 s = clamp(vec3(dot(c, vec3(0.393, 0.769, 0.189)), dot(c, vec3(0.349, 0.686, 0.168)), dot(c, vec3(0.272, 0.534, 0.131))), 0.0, 1.0);
  c = mix(c, s, u_amount);`);
export const invertFx = unpremultiplied('invert', [], '  c = mix(c, 1.0 - c, u_amount);');

const VIGNETTE = `uniform float u_amount, u_size, u_softness;
void main() {
  vec4 p = src(v_img);
  float inner = 0.2 + 0.8 * u_size;
  float width = 0.1 + 0.9 * u_softness * (1.0 - inner);
  float d = length((v_img - 0.5) * 2.0) / 1.41421356;
  float f = 1.0 - 0.9 * u_amount * smoothstep(inner, inner + width, d);
  outColor = vec4(p.rgb * f, p.a);
}`;

export const vignetteFx: FxDef = {
  type: 'vignette',
  available: true,
  run: (rc, src, params) => rc.onePass(rc.program('vignette', [], VIGNETTE), src, paramUniforms(params)),
};
