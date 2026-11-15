// Blur, sharpen, glow and pixelate. Pixel units are source pixels; `pxScale` converts them to target pixels (E2).
import { LUMA709, UNPREMULTIPLY } from '../glsl';
import { paramUniforms } from '../types';
import type { FxDef } from '../types';
import { gaussianBlur } from './gaussian';

const MIN_SIGMA = 0.05;

export const blurFx: FxDef = {
  type: 'blur',
  available: true,
  run(rc, src, params) {
    const sigma = params.radius * rc.info.pxScale;
    if (sigma < MIN_SIGMA) return src;
    const out = gaussianBlur(rc, src, sigma);
    rc.pool.release(src);
    return out;
  },
};

const SHARPEN = `uniform float u_amount;
void main() {
  vec4 p = src(v_img);
  vec4 b = src1(v_img);
  vec3 c = unpremul(p);
  vec3 blurred = unpremul(b);
  c = clamp(c + u_amount * (c - blurred), 0.0, 1.0);
  outColor = vec4(c * p.a, p.a);
}`;

export const sharpenFx: FxDef = {
  type: 'sharpen',
  available: true,
  run(rc, src, params) {
    const prog = rc.program('sharpen', [UNPREMULTIPLY], SHARPEN);
    const blurred = gaussianBlur(rc, src, Math.max(MIN_SIGMA, params.radius * rc.info.pxScale));
    const dst = rc.pool.acquire(src.width, src.height);
    rc.pass.draw(prog, src, dst, { u_amount: params.amount }, [blurred]);
    rc.pool.release(blurred);
    rc.pool.release(src);
    return dst;
  },
};

const BRIGHT = `uniform float u_threshold;
void main() {
  vec4 p = src(v_img);
  float l = dot(unpremul(p), LUMA);
  float k = max(l - u_threshold, 0.0) / max(1.0 - u_threshold, 0.001);
  outColor = p * k;
}`;

const GLOW = `uniform float u_intensity;
void main() {
  vec4 p = src(v_img);
  vec4 g = src1(v_img) * u_intensity;
  float a = max(p.a, min(1.0, g.a));
  outColor = vec4(min(p.rgb + g.rgb, vec3(a)), a);
}`;

export const glowFx: FxDef = {
  type: 'glow',
  available: true,
  run(rc, src, params) {
    const bright = rc.program('glow:bright', [UNPREMULTIPLY, LUMA709], BRIGHT);
    const compose = rc.program('glow:compose', [], GLOW);
    const bp = rc.pool.acquire(src.width, src.height);
    rc.pass.draw(bright, src, bp, { u_threshold: params.threshold });
    const blurred = gaussianBlur(rc, bp, Math.max(MIN_SIGMA, params.radius * rc.info.pxScale));
    rc.pool.release(bp);
    const dst = rc.pool.acquire(src.width, src.height);
    rc.pass.draw(compose, src, dst, { u_intensity: params.intensity }, [blurred]);
    rc.pool.release(blurred);
    rc.pool.release(src);
    return dst;
  },
};

const PIXELATE = `uniform float u_size;
void main() {
  vec2 res = 1.0 / u_texel;
  float block = max(u_size, 1.0);
  vec2 cell = floor(v_img * res / block);
  vec2 centre = (cell + 0.5) * block / res;
  outColor = src(centre);
}`;

export const pixelateFx: FxDef = {
  type: 'pixelate',
  available: true,
  run: (rc, src, params) => rc.onePass(rc.program('pixelate', [], PIXELATE), src, paramUniforms({ size: params.size * rc.info.pxScale })),
};
