// The chroma key (Plan 4 Task 9): one pass. The maths is documented in ../keyMath.ts, which also derives the
// uniforms (`keyCoeffs`); `keyPixel` / `chromaKeyRef` there are the CPU references of this shader. Alpha and spill are
// computed on the straight colour; the output is premultiplied with the source alpha times the key alpha, so keyed
// areas are transparent and the layers below show through.
import { CB_SCALE, CR_SCALE, keyCoeffs, keyParams } from '../keyMath';
import type { PassShader } from '../types';
import { GLSL_HEADER, GLSL_LUMA, GLSL_PREMULTIPLY, f } from './glsl';

export const CHROMA_KEY: PassShader = {
  fragment: `${GLSL_HEADER}
uniform vec2 u_keyChroma;
uniform vec2 u_edge;
uniform vec3 u_spillDir;
uniform float u_spillScale;
${GLSL_LUMA}
${GLSL_PREMULTIPLY}

vec2 chroma(vec3 c) {
  float y = dot(c, LUMA);
  return vec2((c.b - y) / ${f(CB_SCALE)}, (c.r - y) / ${f(CR_SCALE)});
}

void main() {
  vec4 src = texture(u_src, v_uv);
  vec3 c = unpremultiply(src);
  vec2 ch = chroma(c);
  float t = clamp((distance(ch, u_keyChroma) - u_edge.x) * u_edge.y, 0.0, 1.0);
  float keep = t * t * (3.0 - 2.0 * t);
  float s = u_spillScale * max(0.0, dot(ch, u_keyChroma));
  vec3 rgb = clamp(c - s * u_spillDir, 0.0, 1.0);
  outColor = premultiply(rgb, src.a * keep);
}`,
  uniforms: (params) => {
    const k = keyCoeffs(params);
    return { u_keyChroma: k.keyChroma, u_edge: k.edge, u_spillDir: k.spillDir, u_spillScale: k.spillScale };
  },
  run: (pass, params, ctx, size) => {
    // similarity 0 keeps every pixel and spill 0 changes no colour: the identity draws no pass.
    const k = keyParams(params);
    if (k.similarity > 0 || k.spill > 0) pass.draw(CHROMA_KEY.uniforms(params, ctx, size));
  },
};
