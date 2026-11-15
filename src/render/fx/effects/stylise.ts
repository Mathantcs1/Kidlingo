// RGB split, glitch, VHS, mirror and film grain. Time-driven ones are seeded from (frame, clip) so a frame always
// looks the same (Plan 4 E6). Pixel units are source pixels, converted with `pxScale` (E2).
import { HASH, LUMA709, UNPREMULTIPLY } from '../glsl';
import { seedFor, seedVec } from '../seed';
import type { FxDef } from '../types';
import { paramUniforms } from '../types';

const RGBSPLIT = `uniform float u_amount, u_angle;
void main() {
  float a = radians(u_angle);
  vec2 off = vec2(cos(a), sin(a)) * u_amount * u_texel;
  vec4 r = src(v_img - off);
  vec4 g = src(v_img);
  vec4 b = src(v_img + off);
  outColor = vec4(r.r, g.g, b.b, max(r.a, max(g.a, b.a)));
}`;

export const rgbsplitFx: FxDef = {
  type: 'rgbsplit',
  available: true,
  run(rc, src, params) {
    const prog = rc.program('rgbsplit', [], RGBSPLIT);
    if (params.amount <= 0) return src;
    return rc.onePass(prog, src, { u_amount: params.amount * rc.info.pxScale, u_angle: params.angle });
  },
};

const MIRROR = `uniform float u_mode;
void main() {
  vec2 uv = v_img;
  int m = int(u_mode + 0.5);
  if ((m == 0 || m == 4) && uv.x > 0.5) uv.x = 1.0 - uv.x;
  if (m == 1 && uv.x < 0.5) uv.x = 1.0 - uv.x;
  if ((m == 2 || m == 4) && uv.y > 0.5) uv.y = 1.0 - uv.y;
  if (m == 3 && uv.y < 0.5) uv.y = 1.0 - uv.y;
  outColor = src(uv);
}`;

export const mirrorFx: FxDef = {
  type: 'mirror',
  available: true,
  run: (rc, src, params) => rc.onePass(rc.program('mirror', [], MIRROR), src, paramUniforms(params)),
};

const GRAIN = `uniform float u_amount, u_size, u_color;
uniform vec2 u_seed;
void main() {
  vec4 p = src(v_img);
  vec3 c = unpremul(p);
  float l = dot(c, LUMA);
  vec2 cell = floor(v_img / (max(u_size, 1.0) * u_texel)) + u_seed;
  vec3 n = vec3(hash21(cell), hash21(cell + vec2(17.0, 31.0)), hash21(cell + vec2(53.0, 7.0))) - 0.5;
  n = mix(vec3(n.x), n, u_color);
  float w = 1.0 - 0.5 * pow(abs(2.0 * l - 1.0), 2.0);
  c = clamp(c + n * u_amount * w, 0.0, 1.0);
  outColor = vec4(c * p.a, p.a);
}`;

export const grainFx: FxDef = {
  type: 'grain',
  available: true,
  run(rc, src, params) {
    const prog = rc.program('grain', [UNPREMULTIPLY, LUMA709, HASH], GRAIN);
    if (params.amount <= 0) return src;
    return rc.onePass(prog, src, {
      u_amount: params.amount, u_size: params.size * rc.info.pxScale, u_color: params.color, u_seed: seedVec(rc.info.seed),
    });
  },
};

const GLITCH = `uniform float u_amount;
uniform vec2 u_seed;
void main() {
  float band = floor(v_img.y * 24.0);
  float hit = step(hash21(vec2(band, 1.0) + u_seed), u_amount * 0.45);
  float dx = (hash21(vec2(band, 2.0) + u_seed) - 0.5) * 0.25 * u_amount * hit;
  float split = (0.01 + 0.03 * hash21(vec2(band, 3.0) + u_seed)) * u_amount * hit;
  vec2 uv = vec2(v_img.x + dx, v_img.y);
  vec4 r = src(uv + vec2(split, 0.0));
  vec4 g = src(uv);
  vec4 b = src(uv - vec2(split, 0.0));
  outColor = vec4(r.r, g.g, b.b, max(r.a, max(g.a, b.a)));
}`;

export const glitchFx: FxDef = {
  type: 'glitch',
  available: true,
  run(rc, src, params) {
    const prog = rc.program('glitch', [HASH], GLITCH);
    if (params.amount <= 0) return src;
    // `speed` is how often the pattern changes: 1 = every frame, 0 = never.
    const seed = seedFor(Math.floor(rc.info.frame * params.speed), rc.info.clipId);
    return rc.onePass(prog, src, { u_amount: params.amount, u_seed: seedVec(seed) });
  },
};

const VHS = `uniform float u_amount, u_bleed;
uniform vec2 u_seed;
void main() {
  vec2 res = 1.0 / u_texel;
  float line = floor(v_img.y * 120.0);
  vec2 uv = vec2(v_img.x + (hash21(vec2(line, 5.0) + u_seed) - 0.5) * 0.006 * u_amount, v_img.y);
  vec4 p = src(uv);
  vec3 c = unpremul(p);
  float l = dot(c, LUMA);
  vec3 chroma = vec3(0.0);
  for (int k = 0; k < 8; k++) {
    vec3 s = unpremul(src(uv - vec2(float(k) * u_bleed * u_texel.x, 0.0)));
    chroma += s - dot(s, LUMA);
  }
  chroma /= 8.0;
  c = vec3(l) + mix(c - l, chroma, min(1.0, 0.85 * u_amount));
  float scan = 0.5 + 0.5 * sin(v_img.y * 3.14159265 * 60.0);
  c *= 1.0 - 0.1 * u_amount * scan;
  c += (hash21(floor(v_img * res) + u_seed) - 0.5) * 0.08 * u_amount;
  outColor = vec4(clamp(c, 0.0, 1.0) * p.a, p.a);
}`;

export const vhsFx: FxDef = {
  type: 'vhs',
  available: true,
  run(rc, src, params) {
    const prog = rc.program('vhs', [UNPREMULTIPLY, LUMA709, HASH], VHS);
    if (params.amount <= 0) return src;
    return rc.onePass(prog, src, { u_amount: params.amount, u_bleed: (12 * params.amount * rc.info.pxScale) / 8, u_seed: seedVec(rc.info.seed) });
  },
};
