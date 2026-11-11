// The look effects (Plan 4 Task 5): bw, sepia, splitTone, vignette, grain. One pass each; the maths, its constants and
// the CPU references are in ../looksMath.ts. Colour maths runs on straight colour (un-premultiplied), alpha is untouched.
import { CELL_EPS, MIN_SOFTNESS, SEPIA_MATRIX, grainCell, grainInvCell, splitToneCoeffs, vignetteCoeffs } from '../looksMath';
import type { PassShader } from '../types';
import { GLSL_HASH, GLSL_HEADER, GLSL_LUMA, GLSL_PREMULTIPLY, f } from './glsl';

const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const PRE = `${GLSL_LUMA}${GLSL_PREMULTIPLY}`;

export const BW: PassShader = {
  fragment: `${GLSL_HEADER}
uniform float u_amount;
${PRE}
void main() {
  vec4 src = texture(u_src, v_uv);
  vec3 c = unpremultiply(src);
  c = clamp(mix(c, vec3(dot(c, LUMA)), u_amount), 0.0, 1.0);
  outColor = premultiply(c, src.a);
}`,
  uniforms: (p) => ({ u_amount: num(p.amount) }),
};

export const SEPIA: PassShader = {
  fragment: `${GLSL_HEADER}
uniform float u_amount;
const vec3 ROW_R = vec3(${SEPIA_MATRIX[0].map(f).join(', ')});
const vec3 ROW_G = vec3(${SEPIA_MATRIX[1].map(f).join(', ')});
const vec3 ROW_B = vec3(${SEPIA_MATRIX[2].map(f).join(', ')});
${PRE}
void main() {
  vec4 src = texture(u_src, v_uv);
  vec3 c = unpremultiply(src);
  vec3 s = clamp(vec3(dot(ROW_R, c), dot(ROW_G, c), dot(ROW_B, c)), 0.0, 1.0);
  c = clamp(mix(c, s, u_amount), 0.0, 1.0);
  outColor = premultiply(c, src.a);
}`,
  uniforms: (p) => ({ u_amount: num(p.amount) }),
};

export const SPLIT_TONE: PassShader = {
  fragment: `${GLSL_HEADER}
uniform vec3 u_shadow;
uniform vec3 u_highlight;
uniform float u_pivot;
${PRE}
void main() {
  vec4 src = texture(u_src, v_uv);
  vec3 c = unpremultiply(src);
  float s = smoothstep(u_pivot - 0.5, u_pivot + 0.5, dot(c, LUMA));
  c = clamp(c + (1.0 - s) * u_shadow + s * u_highlight, 0.0, 1.0);
  outColor = premultiply(c, src.a);
}`,
  uniforms: (p) => {
    const k = splitToneCoeffs(p);
    return { u_shadow: k.shadow, u_highlight: k.highlight, u_pivot: k.pivot };
  },
};

export const VIGNETTE: PassShader = {
  // gl_FragCoord is the pixel centre in the working-size target, y down in the picture (see PassShader).
  fragment: `${GLSL_HEADER}
uniform vec2 u_size;
uniform vec3 u_vig;
${PRE}
void main() {
  vec4 src = texture(u_src, v_uv);
  vec3 c = unpremultiply(src);
  float d = length(gl_FragCoord.xy - 0.5 * u_size) / (0.5 * length(u_size));
  float k = 1.0 - u_vig.x * smoothstep(u_vig.y, u_vig.y + max(u_vig.z, ${f(MIN_SOFTNESS)}), d);
  outColor = premultiply(clamp(c * k, 0.0, 1.0), src.a);
}`,
  uniforms: (p) => ({ u_vig: vignetteCoeffs(p) }),
};

export const GRAIN: PassShader = {
  // GLSL_HASH is the twin of grainHash (looksMath.ts).
  fragment: `${GLSL_HEADER}
uniform float u_frame;
uniform float u_amount;
uniform float u_invCell;
${PRE}
${GLSL_HASH}

void main() {
  vec4 src = texture(u_src, v_uv);
  vec3 c = unpremultiply(src);
  vec2 cell = floor(gl_FragCoord.xy * u_invCell + ${f(CELL_EPS)});
  float n = u_amount * (hash(uint(u_frame), uint(cell.x), uint(cell.y)) - 0.5);
  outColor = premultiply(clamp(c + n, 0.0, 1.0), src.a);
}`,
  uniforms: (p, _ctx, size) => ({ u_amount: num(p.amount), u_invCell: grainInvCell(grainCell(p.size, size.height)) }),
};
