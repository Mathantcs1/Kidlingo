/** CSS-style cubic Bézier easing solver (pure). Control points (0,0), (x1,y1), (x2,y2), (1,1). */

const X_TOLERANCE = 1e-10;

function coord(a: number, b: number, s: number): number {
  const k = 1 - s;
  return 3 * k * k * s * a + 3 * k * s * s * b + s * s * s;
}

function slope(a: number, b: number, s: number): number {
  const k = 1 - s;
  return 3 * k * k * a + 6 * k * s * (b - a) + 3 * s * s * (1 - b);
}

/**
 * y(s) where s solves x(s) = u. x1 and x2 are clamped to [0, 1], so x(s) is monotone and the solution is unique.
 * Newton from s = u, falling back to bisection when the slope is tiny or Newton leaves [0, 1].
 * Exactly 0 at u <= 0 and exactly 1 at u >= 1.
 */
export function cubicBezierAt(x1: number, y1: number, x2: number, y2: number, u: number): number {
  if (!(u > 0)) return 0;
  if (u >= 1) return 1;
  const a = Math.min(1, Math.max(0, x1));
  const b = Math.min(1, Math.max(0, x2));
  let s = u;
  let solved = false;
  for (let i = 0; i < 8; i++) {
    const err = coord(a, b, s) - u;
    if (Math.abs(err) < X_TOLERANCE) {
      solved = true;
      break;
    }
    const d = slope(a, b, s);
    if (Math.abs(d) < 1e-6) break;
    const next = s - err / d;
    if (!(next >= 0 && next <= 1)) break;
    s = next;
  }
  if (!solved) {
    let lo = 0;
    let hi = 1;
    s = u;
    for (let i = 0; i < 64; i++) {
      const err = coord(a, b, s) - u;
      if (Math.abs(err) < X_TOLERANCE) break;
      if (err < 0) lo = s;
      else hi = s;
      s = (lo + hi) / 2;
    }
  }
  return coord(y1, y2, s);
}
