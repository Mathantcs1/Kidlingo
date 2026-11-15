// A separable Gaussian blur shared by blur, sharpen and glow. 17 taps per pass; a large sigma is first reduced by
// 2x box downsamples (bilinear) so the taps always cover about 2.7 sigma, then the result is upsampled again.
import type { FxRunContext } from '../types';
import type { Target } from '../pool';

const MAX_TAP_SIGMA = 3;

const COPY = `void main() { outColor = src(v_img); }`;
const AXIS = `uniform vec2 u_dir;
uniform float u_sigma;
void main() {
  vec4 sum = vec4(0.0);
  float total = 0.0;
  float k = 1.0 / (2.0 * max(u_sigma, 0.01) * max(u_sigma, 0.01));
  for (int i = -8; i <= 8; i++) {
    float w = exp(-float(i * i) * k);
    sum += src(v_img + u_dir * float(i)) * w;
    total += w;
  }
  outColor = sum / total;
}`;

/** A blurred copy of `src` (premultiplied, same size). `sigma` is in src target pixels. `src` is NOT released. */
export function gaussianBlur(rc: FxRunContext, src: Target, sigma: number): Target {
  const copy = rc.program('blur:copy', [], COPY);
  const axis = rc.program('blur:axis', [], AXIS);
  let steps = 0;
  while (sigma / 2 ** steps > MAX_TAP_SIGMA && Math.min(src.width, src.height) / 2 ** (steps + 1) >= 1) steps++;
  let cur = src;
  let owned: Target | null = null;
  const advance = (next: Target): void => {
    if (owned) rc.pool.release(owned);
    owned = cur = next;
  };
  for (let i = 0; i < steps; i++) {
    const dst = rc.pool.acquire(Math.max(1, Math.ceil(cur.width / 2)), Math.max(1, Math.ceil(cur.height / 2)));
    rc.pass.draw(copy, cur, dst, {});
    advance(dst);
  }
  const sx = (sigma * cur.width) / src.width;
  const sy = (sigma * cur.height) / src.height;
  const horizontal = rc.pool.acquire(cur.width, cur.height);
  rc.pass.draw(axis, cur, horizontal, { u_dir: [1 / cur.width, 0], u_sigma: sx });
  advance(horizontal);
  const vertical = rc.pool.acquire(cur.width, cur.height);
  rc.pass.draw(axis, cur, vertical, { u_dir: [0, 1 / cur.height], u_sigma: sy });
  advance(vertical);
  if (cur.width === src.width && cur.height === src.height) return cur;
  const full = rc.pool.acquire(src.width, src.height);
  rc.pass.draw(copy, cur, full, {});
  advance(full);
  return full;
}
