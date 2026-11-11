// The stylise effects (Plan 4 Task 8): invert, mirror, rgbSplit, glitch, vhs. One pass each, drawn through `run` so an
// identity setting draws no pass at all. The maths, constants and coefficients are in ../styliseMath.ts (CPU
// references in ../styliseRef.ts); colour maths runs on straight colour; displaced samples go through GLSL_SAMPLE's
// `at`, which maps working-pixel positions through u_uv (upright in the first pass too) and clamps to the picture.
import { CELL_EPS } from '../looksMath';
import {
  SALT_SHIFT, SALT_SPLIT, SALT_WOBBLE, VHS, glitchCoeffs, mirrorMode, rgbSplitOffset, vhsCoeffs,
} from '../styliseMath';
import type { PassShader } from '../types';
import { GLSL_HASH, GLSL_HEADER, GLSL_LUMA, GLSL_PREMULTIPLY, GLSL_SAMPLE, f } from './glsl';

const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const PRE = `${GLSL_LUMA}${GLSL_PREMULTIPLY}${GLSL_SAMPLE}
float cellOf(float p, float inv) {
  return floor(p * inv + ${f(CELL_EPS)});
}`;

export const INVERT: PassShader = {
  fragment: `${GLSL_HEADER}
uniform float u_amount;
${PRE}
void main() {
  vec4 src = texture(u_src, v_uv);
  vec3 c = unpremultiply(src);
  outColor = premultiply(clamp(mix(c, 1.0 - c, u_amount), 0.0, 1.0), src.a);
}`,
  uniforms: (p) => ({ u_amount: num(p.amount) }),
  run: (pass, p) => {
    if (num(p.amount) > 0) pass.draw({ u_amount: num(p.amount) });
  },
};

export const MIRROR: PassShader = {
  fragment: `${GLSL_HEADER}
uniform float u_mode;
${PRE}
void main() {
  vec2 p = gl_FragCoord.xy;
  vec2 mid = 0.5 * u_size;
  bool fx = (u_mode == 0.0 || u_mode == 3.0) ? p.x >= mid.x : (u_mode == 1.0 && p.x < mid.x);
  bool fy = (u_mode == 2.0 || u_mode == 3.0) && p.y >= mid.y;
  outColor = at(vec2(fx ? u_size.x - p.x : p.x, fy ? u_size.y - p.y : p.y));
}`,
  uniforms: (p) => ({ u_mode: mirrorMode(p) }),
};

export const RGB_SPLIT: PassShader = {
  fragment: `${GLSL_HEADER}
uniform vec2 u_offset;
${PRE}
void main() {
  vec2 p = gl_FragCoord.xy;
  vec4 g = at(p);
  float r = unpremultiply(at(p - u_offset)).r;
  float b = unpremultiply(at(p + u_offset)).b;
  outColor = premultiply(vec3(r, unpremultiply(g).g, b), g.a);
}`,
  uniforms: (p, _ctx, size) => ({ u_offset: rgbSplitOffset(p, size.height) }),
  run: (pass, p, ctx, size) => {
    const u = RGB_SPLIT.uniforms(p, ctx, size);
    const [dx, dy] = u.u_offset as number[];
    if (dx !== 0 || dy !== 0) pass.draw(u);
  },
};

export const GLITCH: PassShader = {
  fragment: `${GLSL_HEADER}
uniform float u_frame;
uniform float u_invBlock;
uniform float u_invBlockW;
uniform float u_prob;
uniform float u_maxShift;
uniform float u_maxSplit;
${PRE}
${GLSL_HASH}

void main() {
  vec2 p = gl_FragCoord.xy;
  uint fr = uint(u_frame);
  uint bx = uint(cellOf(p.x, u_invBlockW));
  uint by = uint(cellOf(p.y, u_invBlock));
  if (!(hash(fr, bx, by) < u_prob)) {
    outColor = at(p);
    return;
  }
  float shift = floor((hash(fr, bx, by + ${SALT_SHIFT}u) - 0.5) * u_maxShift);
  float split = floor(hash(fr, bx, by + ${SALT_SPLIT}u) * u_maxSplit);
  vec2 s = vec2(p.x + shift, p.y);
  vec4 g = at(s);
  float r = unpremultiply(at(s + vec2(split, 0.0))).r;
  float b = unpremultiply(at(s - vec2(split, 0.0))).b;
  outColor = premultiply(vec3(r, unpremultiply(g).g, b), g.a);
}`,
  uniforms: (p, _ctx, size) => {
    const k = glitchCoeffs(p, size);
    return { u_invBlock: k.invBlock, u_invBlockW: k.invBlockW, u_prob: k.prob, u_maxShift: k.maxShift, u_maxSplit: k.maxSplit };
  },
  run: (pass, p, ctx, size) => {
    const u = GLITCH.uniforms(p, ctx, size);
    if ((u.u_prob as number) > 0) pass.draw(u);
  },
};

export const VHS_SHADER: PassShader = {
  fragment: `${GLSL_HEADER}
uniform float u_frame;
uniform float u_invScan;
uniform float u_scanDepth;
uniform float u_invNoise;
uniform float u_noise;
uniform float u_bleed;
uniform float u_step;
uniform float u_invWobble;
uniform float u_wobbleSpan;
${PRE}
${GLSL_HASH}

void main() {
  vec2 p = gl_FragCoord.xy;
  uint fr = uint(u_frame);
  uint band = uint(cellOf(p.y, u_invWobble));
  float shift = floor((hash(fr, 0u, band + ${SALT_WOBBLE}u) - 0.5) * u_wobbleSpan);
  vec2 s = vec2(p.x + shift, p.y);
  vec4 base = at(s);
  vec3 c = unpremultiply(base);
  if (u_bleed > 0.0) {
    float y0 = dot(c, LUMA);
    vec3 avg = vec3(0.0);
    for (int t = 1; t <= ${VHS.bleedTaps}; t++) {
      vec3 q = unpremultiply(at(s - vec2(float(t) * u_step, 0.0)));
      avg += (q - dot(q, LUMA)) / ${f(VHS.bleedTaps)};
    }
    c = y0 + mix(c - y0, avg, u_bleed);
  }
  float dark = mod(cellOf(p.y, u_invScan), 2.0) == 1.0 ? 1.0 - u_scanDepth : 1.0;
  float n = u_noise * (hash(fr, uint(cellOf(p.x, u_invNoise)), uint(cellOf(p.y, u_invNoise))) - 0.5);
  outColor = premultiply(clamp(c * dark + n, 0.0, 1.0), base.a);
}`,
  uniforms: (p, _ctx, size) => {
    const k = vhsCoeffs(p, size);
    return {
      u_invScan: k.invScan, u_scanDepth: k.scanDepth, u_invNoise: k.invNoise, u_noise: k.noise, u_bleed: k.bleed,
      u_step: k.step, u_invWobble: k.invWobble, u_wobbleSpan: k.wobbleSpan,
    };
  },
  run: (pass, p, ctx, size) => {
    const u = VHS_SHADER.uniforms(p, ctx, size);
    if (u.u_scanDepth || u.u_noise || u.u_bleed || u.u_wobbleSpan) pass.draw(u);
  },
};
