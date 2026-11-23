// Hand-sketched drawing kit: deterministic wobbly pencil lines, offset colour blocks, hatching and a paper sheet. Pure helpers are
// testable in Node (rng, jitterPath, point builders); the draw functions need a 2D canvas context.
export function rng(seed) {   // mulberry32
  let a = seed | 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Resample a polyline every `step` px and push each point by smooth low-frequency noise (|offset| ≤ amp). Same seed → same wobble. */
export function jitterPath(pts, { seed = 1, amp = 1.5, step = 12 } = {}) {
  const out = [];
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.max(1, Math.round(Math.hypot(x1 - x0, y1 - y0) / step));
    for (let k = 0; k < n; k++) out.push([x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]);
  }
  out.push(pts.at(-1));
  const r = rng(seed), every = 3, nodes = Array.from({ length: Math.ceil(out.length / every) + 2 }, () => [(r() * 2 - 1) * 0.7, (r() * 2 - 1) * 0.7]);
  return out.map(([x, y], i) => {
    const g = i / every, j = Math.floor(g), f = g - j, u = f * f * (3 - 2 * f), a = nodes[j], b = nodes[j + 1];
    return [x + amp * (a[0] + (b[0] - a[0]) * u), y + amp * (a[1] + (b[1] - a[1]) * u)];
  });
}

export const ellipsePts = (cx, cy, rx, ry, n = 32) => Array.from({ length: n + 1 }, (_, i) => [cx + rx * Math.cos(2 * Math.PI * i / n), cy + ry * Math.sin(2 * Math.PI * i / n)]);
export const rectPts = (x, y, w, h) => [[x, y], [x + w, y], [x + w, y + h], [x, y + h], [x, y]];
/** Smooth closed or open curve through control points (Catmull-Rom), `seg` samples per span. */
export function curvePts(c, { closed = false, seg = 6 } = {}) {
  const P = closed ? [c.at(-1), ...c, c[0], c[1]] : [c[0], ...c, c.at(-1)], out = [];
  for (let i = 1; i < P.length - 2; i++) for (let s = 0; s < seg; s++) {
    const t = s / seg, t2 = t * t, t3 = t2 * t;
    out.push([0, 1].map(d => 0.5 * (2 * P[i][d] + (-P[i - 1][d] + P[i + 1][d]) * t + (2 * P[i - 1][d] - 5 * P[i][d] + 4 * P[i + 1][d] - P[i + 2][d]) * t2 + (-P[i - 1][d] + 3 * P[i][d] - 3 * P[i + 1][d] + P[i + 2][d]) * t3)));
  }
  out.push(closed ? out[0] : c.at(-1));
  return out;
}
export const roundRectPts = (x, y, w, h, r) => curvePts([[x + r, y], [x + w - r, y], [x + w, y + r], [x + w, y + h - r], [x + w - r, y + h], [x + r, y + h], [x, y + h - r], [x, y + r]], { closed: true, seg: 4 });

const trace = (ctx, p) => { ctx.beginPath(); p.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); };

/** Graphite line: two or three wobbly passes of decreasing weight, like a sketch gone over twice. */
export function pencil(ctx, pts, { color = '#3a342f', width = 3, seed = 1, amp = 1.6, passes = 2, alpha = 0.85 } = {}) {
  ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = color;
  for (let p = 0; p < passes; p++) {
    ctx.globalAlpha = alpha * (1 - 0.28 * p); ctx.lineWidth = Math.max(0.8, width * (1 - 0.32 * p));
    trace(ctx, jitterPath(pts, { seed: seed + 17 * p, amp: amp * (1 + 0.5 * p), step: 9 })); ctx.stroke();
  }
  ctx.restore();
}

/** Colour block laid under the line and shifted off it (down-right), with a ragged edge, like marker that missed the outline. */
export function colorBlock(ctx, pts, color, { dx = 5, dy = 6, seed = 1, alpha = 1 } = {}) {
  ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = color;   // opaque: objects must hide what is behind them
  trace(ctx, jitterPath(pts, { seed: seed + 91, amp: 2.2, step: 14 }).map(([x, y]) => [x + dx, y + dy])); ctx.closePath(); ctx.fill(); ctx.restore();
}

/** Parallel pencil hatching clipped inside a closed shape (shadow side). */
export function hatch(ctx, pts, { angle = -0.9, gap = 9, color = '#3a342f', width = 1.3, seed = 3, alpha = 0.45 } = {}) {
  const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]), x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2, r = rng(seed);
  ctx.save(); trace(ctx, pts); ctx.closePath(); ctx.clip(); ctx.strokeStyle = color; ctx.lineWidth = width; ctx.globalAlpha = alpha; ctx.lineCap = 'round';
  for (let o = -R; o < R; o += gap) {
    const ca = Math.cos(angle), sa = Math.sin(angle), jx = (r() - 0.5) * 3;
    ctx.beginPath(); ctx.moveTo(cx - sa * o - ca * R + jx, cy + ca * o - sa * R); ctx.lineTo(cx - sa * o + ca * R - jx, cy + ca * o + sa * R); ctx.stroke();
  }
  ctx.restore();
}

/** One sketched object: colour block, optional hatching, then the pencil outline. */
export function shape(ctx, pts, { fill, line = {}, hatchOpts = null, seed = 1 } = {}) {
  if (fill) colorBlock(ctx, pts, fill, { seed });
  if (hatchOpts) hatch(ctx, pts, { seed, ...hatchOpts });
  pencil(ctx, pts, { seed, ...line });
}

const paperCache = new Map();
/** Cream paper with grain, fibres and a soft vignette. Cached per size (deterministic). */
export function paperCanvas(W, H, seed = 7) {
  const key = `${W}x${H}x${seed}`;
  if (paperCache.has(key)) return paperCache.get(key);
  const c = Object.assign(document.createElement('canvas'), { width: W, height: H }), g = c.getContext('2d'), r = rng(seed);
  g.fillStyle = '#f2e9d6'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < W * H / 140; i++) { g.fillStyle = `rgba(${90 + r() * 40},${70 + r() * 30},50,${0.025 + r() * 0.06})`; g.fillRect(r() * W, r() * H, 1 + r() * 1.6, 1 + r() * 1.6); }
  g.strokeStyle = 'rgba(120,95,70,0.05)'; g.lineWidth = 1;
  for (let i = 0; i < 140; i++) { const x = r() * W, y = r() * H, a = r() * 6.28, l = 12 + r() * 36; g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a) * l / 2 + 6, y + Math.sin(a) * l / 2, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(90,60,30,0.28)');
  g.fillStyle = v; g.fillRect(0, 0, W, H);
  paperCache.set(key, c); return c;
}
