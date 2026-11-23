// Sketched object kit. Each draws with its origin at bottom-centre; s = pixels per metre. Every object has its own drawing, no generic boxes.
import { shape, pencil, curvePts, ellipsePts, roundRectPts, rectPts } from './sketch.js';
const R = (x, y, w, h) => rectPts(x, y, w, h);
const at = (x, y, s) => (px, py) => [x + px * s, y + py * s];

export function oven(ctx, x, y, s, seed = 1) {
  const P = at(x, y, s);
  shape(ctx, curvePts([P(-0.7, 0), P(0.7, 0), P(0.72, -1.2), P(0.5, -1.5), P(-0.5, -1.5), P(-0.72, -1.2)], { closed: true }), { fill: '#7e8794', line: { width: 3.4, seed }, hatchOpts: { gap: 11, alpha: 0.25 }, seed });
  shape(ctx, curvePts([P(-0.38, -0.12), P(0.38, -0.12), P(0.38, -0.7), P(0, -0.98), P(-0.38, -0.7)], { closed: true }), { fill: '#f58a2a', line: { width: 3, seed: seed + 1 }, seed });   // glowing arch door
  shape(ctx, curvePts([P(-0.12, -0.2), P(0.0, -0.55), P(0.1, -0.2)], { closed: true }), { fill: '#ffd25a', line: { width: 2, seed }, seed });
  shape(ctx, R(...P(0.28, -2.3), 0.22 * s, 0.8 * s), { fill: '#5d6572', line: { width: 3, seed: seed + 2 }, seed });   // chimney
  for (const px of [-0.45, 0.45]) pencil(ctx, [P(px, -1.28), P(px, -1.4)], { width: 6, seed, passes: 1 });   // knobs
}
export function loaf(ctx, x, y, s, seed = 1) {
  const P = at(x, y, s);
  shape(ctx, curvePts([P(-0.3, 0), P(0.3, 0), P(0.34, -0.12), P(0.2, -0.24), P(-0.2, -0.24), P(-0.34, -0.12)], { closed: true }), { fill: '#d9954a', line: { width: 3, seed }, hatchOpts: { gap: 8, alpha: 0.3 }, seed });
  for (const px of [-0.14, 0, 0.14]) pencil(ctx, [P(px - 0.03, -0.2), P(px + 0.03, -0.1)], { width: 2.2, seed: seed + px * 10, passes: 1 });
}
export function rollingPin(ctx, x, y, s, seed = 1) {
  const P = at(x, y, s);
  shape(ctx, roundRectPts(...P(-0.4, -0.08), 0.8 * s, 0.16 * s, 0.07 * s), { fill: '#e6c28a', line: { width: 2.8, seed }, seed });
  for (const sg of [-1, 1]) shape(ctx, roundRectPts(...P(sg * 0.5 - 0.06, -0.05), 0.12 * s, 0.1 * s, 0.04 * s), { fill: '#b9854d', line: { width: 2.4, seed: seed + sg }, seed });
}
export function basket(ctx, x, y, s, seed = 1) {
  const P = at(x, y, s);
  loaf(ctx, ...P(-0.1, -0.34), s * 0.8, seed + 3); loaf(ctx, ...P(0.14, -0.4), s * 0.7, seed + 4);
  const body = curvePts([P(-0.35, -0.38), P(0.35, -0.38), P(0.28, 0), P(-0.28, 0)], { closed: true });
  shape(ctx, body, { fill: '#c99a5b', line: { width: 3, seed }, hatchOpts: { gap: 7, alpha: 0.4, angle: 0.7 }, seed });
  pencil(ctx, curvePts([P(-0.34, -0.38), P(0, -0.7), P(0.34, -0.38)]), { width: 3, seed: seed + 2 });   // handle
}
export function streetLamp(ctx, x, y, s, seed = 1) {
  const P = at(x, y, s);
  ctx.save(); ctx.globalCompositeOperation = 'multiply'; const g = ctx.createRadialGradient(...P(0, -3.2), 0, ...P(0, -3.2), 1.1 * s); g.addColorStop(0, 'rgba(255,214,110,0.8)'); g.addColorStop(1, 'rgba(255,214,110,0)'); ctx.fillStyle = g; ctx.beginPath(); ctx.arc(...P(0, -3.2), 1.1 * s, 0, 6.2832); ctx.fill(); ctx.restore();
  shape(ctx, R(...P(-0.05, -3), 0.1 * s, 3 * s), { fill: '#3d4552', line: { width: 3, seed }, seed });
  shape(ctx, curvePts([P(-0.2, -3.0), P(0.2, -3.0), P(0.26, -3.3), P(0, -3.5), P(-0.26, -3.3)], { closed: true }), { fill: '#ffe08a', line: { width: 3, seed: seed + 1 }, seed });
  shape(ctx, curvePts([P(-0.14, 0), P(0.14, 0), P(0.1, -0.3), P(-0.1, -0.3)], { closed: true }), { fill: '#3d4552', line: { width: 3, seed: seed + 2 }, seed });
}
export function windowObj(ctx, x, y, s, seed = 1) {
  const P = at(x, y, s);
  shape(ctx, R(...P(-0.5, -1.3), 1 * s, 1.3 * s), { fill: '#2c3b66', line: { width: 4, seed }, seed });
  for (const [px, py] of [[-0.25, -1.0], [0.2, -0.6]]) pencil(ctx, [P(px - 0.04, py), P(px + 0.04, py), P(px, py - 0.05), P(px, py + 0.05)], { width: 2, color: '#ffe9a8', passes: 1 });   // stars
  pencil(ctx, [P(0, -1.3), P(0, 0)], { width: 3.4, seed: seed + 1 }); pencil(ctx, [P(-0.5, -0.65), P(0.5, -0.65)], { width: 3.4, seed: seed + 2 });
  for (const sg of [-1, 1]) shape(ctx, curvePts([P(sg * 0.5, -1.3), P(sg * 0.22, -1.3), P(sg * 0.3, -0.7), P(sg * 0.24, -0.1), P(sg * 0.5, -0.1)], { closed: true }), { fill: '#d7684f', line: { width: 2.4, seed: seed + sg }, hatchOpts: { gap: 9, alpha: 0.25, angle: 1.5 }, seed });   // curtains
}
export function house(ctx, x, y, s, seed = 1, tint = '#b9776a') {
  const P = at(x, y, s);
  shape(ctx, R(...P(-0.9, -3.0), 1.8 * s, 3 * s), { fill: tint, line: { width: 3.6, seed }, hatchOpts: { gap: 12, alpha: 0.2 }, seed });
  shape(ctx, [P(-1.0, -3.0), P(0, -3.8), P(1.0, -3.0), P(-1.0, -3.0)], { fill: '#6a4f4a', line: { width: 3.6, seed: seed + 1 }, seed });
  shape(ctx, R(...P(0.4, -4.3), 0.25 * s, 0.7 * s), { fill: '#8c6a5a', line: { width: 3, seed: seed + 2 }, seed });
  shape(ctx, roundRectPts(...P(-0.2, -1.4), 0.5 * s, 1.4 * s, 0.1 * s), { fill: '#5d7c8a', line: { width: 3, seed: seed + 3 }, seed });
  for (const [px, py] of [[-0.65, -2.5], [0.4, -2.5], [-0.65, -1.4]]) shape(ctx, R(...P(px, py), 0.4 * s, 0.5 * s), { fill: '#ffe6a0', line: { width: 2.6, seed: seed + px * 7 }, seed });
}
export function sign(ctx, x, y, s, seed = 1) {
  const P = at(x, y, s);
  pencil(ctx, [P(-0.6, 0), P(0.6, 0)], { width: 4, seed, passes: 1 }); for (const px of [-0.45, 0.45]) pencil(ctx, [P(px, 0), P(px, 0.25)], { width: 2.4, seed: seed + px * 9, passes: 1 });
  shape(ctx, roundRectPts(...P(-0.6, 0.25), 1.2 * s, 0.6 * s, 0.1 * s), { fill: '#f1d58c', line: { width: 3.2, seed: seed + 1 }, seed });
  loaf(ctx, ...P(0, 0.72), s * 1.2, seed + 2);
}
export function flourSack(ctx, x, y, s, seed = 1) {
  const P = at(x, y, s);
  shape(ctx, curvePts([P(-0.3, 0), P(0.3, 0), P(0.34, -0.6), P(0.16, -0.78), P(-0.16, -0.78), P(-0.34, -0.6)], { closed: true }), { fill: '#e8dcc2', line: { width: 3.2, seed }, hatchOpts: { gap: 11, alpha: 0.25 }, seed });
  pencil(ctx, curvePts([P(-0.16, -0.78), P(0, -0.86), P(0.16, -0.78)]), { width: 3, seed: seed + 1, passes: 1 }); pencil(ctx, [P(-0.1, -0.5), P(0.1, -0.5), P(0, -0.3), P(-0.1, -0.5)], { width: 2.6, seed: seed + 2, passes: 1, color: '#b3302f' });
}
export function counter(ctx, x, y, s, seed = 1, w = 2.4) {
  const P = at(x, y, s);
  shape(ctx, R(...P(-w / 2, -1.0), w * s, 1.0 * s), { fill: '#a9744f', line: { width: 3.4, seed }, hatchOpts: { gap: 10, alpha: 0.25, angle: 1.4 }, seed });
  shape(ctx, R(...P(-w / 2 - 0.08, -1.1), (w + 0.16) * s, 0.12 * s), { fill: '#e2c9a0', line: { width: 3, seed: seed + 1 }, seed });
  for (let i = 0; i < Math.floor(w / 0.8); i++) shape(ctx, R(...P(-w / 2 + 0.1 + i * 0.8, -0.85), 0.6 * s, 0.7 * s), { line: { width: 2.2, seed: seed + i }, seed });
}
export function mug(ctx, x, y, s, seed = 1) {
  const P = at(x, y, s);
  shape(ctx, curvePts([P(-0.12, -0.2), P(0.12, -0.2), P(0.1, 0), P(-0.1, 0)], { closed: true }), { fill: '#d9453d', line: { width: 2.8, seed }, seed });
  pencil(ctx, curvePts([P(0.12, -0.16), P(0.22, -0.12), P(0.12, -0.05)]), { width: 2.6, seed: seed + 1, passes: 1 });
  for (const px of [-0.05, 0.05]) pencil(ctx, curvePts([P(px, -0.26), P(px - 0.04, -0.34), P(px + 0.04, -0.42)]), { width: 1.8, seed: seed + px * 30, passes: 1, alpha: 0.5 });   // steam
}
export function tree(ctx, x, y, s, seed = 1) {
  const P = at(x, y, s);
  shape(ctx, curvePts([P(-0.08, 0), P(0.08, 0), P(0.06, -1.1), P(-0.06, -1.1)], { closed: true }), { fill: '#7a5a3f', line: { width: 3, seed }, seed });
  shape(ctx, curvePts([P(-0.7, -1.3), P(-0.5, -2.0), P(-0.1, -2.4), P(0.4, -2.3), P(0.75, -1.8), P(0.6, -1.2), P(0, -1.0)], { closed: true }), { fill: '#6fa066', line: { width: 3.2, seed: seed + 1 }, hatchOpts: { gap: 12, alpha: 0.25 }, seed });
}
export function breadShelf(ctx, x, y, s, seed = 1) {
  const P = at(x, y, s);
  for (let r = 0; r < 3; r++) { shape(ctx, R(...P(-0.9, -0.9 * (r + 1)), 1.8 * s, 0.07 * s), { fill: '#7a5a3f', line: { width: 3, seed: seed + r }, seed }); for (let i = 0; i < 4; i++) loaf(ctx, ...P(-0.6 + i * 0.42, -0.9 * (r + 1)), s * 0.9, seed + r * 9 + i); }
}
export const PROPS = { oven, loaf, rollingPin, basket, streetLamp, windowObj, house, sign, flourSack, counter, mug, tree, breadShelf };
