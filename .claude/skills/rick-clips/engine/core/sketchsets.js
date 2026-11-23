// Sketchbook sets as depth planes (back to front). Static planes are drawn once; the plane marked `figures` is redrawn live each frame
// with the cast. Plane canvases are oversized by a margin, so g draws in 0..W x 0..H with room to spare for parallax.
import { pencil, shape, curvePts, ellipsePts, rectPts } from './sketch.js';
import { U, hh, glow, motes, fillAll } from './sketchkit.js';
import { oven, breadShelf, windowObj, counter, mug, rollingPin, basket, flourSack, house, streetLamp, tree } from './props.js';

const bunting = (g, W, H) => {
  const k = U(W, H) / 1080;
  pencil(g, curvePts([[-W * 0.4, H * 0.02], [W * 0.5, H * 0.07], [W * 1.4, H * 0.02]]), { width: 4, seed: 14 });
  for (let i = 0; i < 7; i++) { const x = W * (0.05 + i * 0.15), y = H * (0.03 + 0.04 * Math.sin(i * 0.9 + 0.5)); shape(g, [[x - 38 * k, y], [x + 38 * k, y], [x, y + 90 * k], [x - 38 * k, y]], { fill: ['#d9453d', '#e8b923', '#2f8f8a'][i % 3], line: { width: 3, seed: 20 + i }, seed: 20 + i }); }
};

import { SKETCH_SETS_MORE } from './sketchsets2.js';
const BASE_SETS = {
  bakery: [
    { depth: 0, draw: (g, W, H) => { fillAll(g, W, H, '#8d5a45'); for (let y = -H * 0.3; y < H * 1.3; y += 70) { g.strokeStyle = 'rgba(58,52,47,.22)'; g.lineWidth = 2; g.beginPath(); g.moveTo(-W * 0.4, y); g.lineTo(W * 1.4, y); g.stroke(); } windowObj(g, W * 0.5, H * 0.52, U(W, H) * 0.5, 3); } },
    { depth: 0.35, draw: (g, W, H) => { breadShelf(g, W * 0.2, H * 0.74, U(W, H) * 0.2, 5); oven(g, W * 0.84, H * 0.76, U(W, H) * 0.3, 6); } },
    { depth: 0.36, live: (g, W, H, t) => glow(g, W * 0.84, H * 0.7, U(W, H) * 0.5, '255,150,40', 0.35 + 0.2 * Math.sin(t * 7) * Math.sin(t * 3.1)) },   // oven glow flickers
    { depth: 0.65, figures: true },
    { depth: 0.75, draw: (g, W, H) => { const s = U(W, H) * 0.34 * 0.9, y = H * 0.87; counter(g, W * 0.5, y, s, 9, Math.max(3.4, W / s * 1.05)); mug(g, W * 0.27, y - 1.0 * s - 8, s, 10); rollingPin(g, W * 0.7, y - 1.1 * s, s, 11); basket(g, W * 0.82, y - 1.1 * s, s, 12); } },
    { depth: 1, draw: (g, W, H) => { flourSack(g, W * 0.1, H * 1.0, U(W, H) * 0.37, 13); bunting(g, W, H); } },
    { depth: 1.15, live: (g, W, H, t) => motes(g, W, H, t, 26, '#fff4d6', 1.2) },   // flour dust drifting past the lens
  ],
  street: [
    { depth: 0.04, live: (g, W, H, t) => { const u = U(W, H); for (let i = 0; i < 22; i++) { const x = W * (hh(i) * 1.3 - 0.15), y = H * hh(i + 40) * 0.5, a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 3 + i * 1.7)); pencil(g, [[x - 7 * u / 1080, y], [x + 7 * u / 1080, y], [x, y - 7 * u / 1080], [x, y + 7 * u / 1080]], { width: 2, color: '#ffe9a8', passes: 1, alpha: a, seed: i }); } } },   // stars twinkle
    { depth: 0, draw: (g, W, H) => { const sky = g.createLinearGradient(0, -H * 0.3, 0, H * 0.7); sky.addColorStop(0, '#2f3d68'); sky.addColorStop(1, '#6b78a6'); g.fillStyle = sky; g.fillRect(-W * 0.4, -H * 0.4, W * 1.8, H * 1.8);
      shape(g, ellipsePts(W * 0.78, H * 0.16, U(W, H) * 0.07, U(W, H) * 0.07, 20), { fill: '#f6efd2', line: { width: 3, seed: 31 }, seed: 31 });
      for (let i = 0; i < 16; i++) { const x = W * ((i * 0.137) % 1.2 - 0.1), y = H * (0.03 + ((i * 0.071) % 0.3)); pencil(g, [[x - 6, y], [x + 6, y], [x, y - 6], [x, y + 6]], { width: 2, color: '#ffe9a8', passes: 1, seed: i }); }
      shape(g, curvePts([[-W * 0.4, H * 0.62], [W * 0.1, H * 0.5], [W * 0.5, H * 0.58], [W * 0.9, H * 0.48], [W * 1.4, H * 0.6], [W * 1.4, H * 0.8], [-W * 0.4, H * 0.8]], { closed: true }), { fill: '#4a5882', line: { width: 3, seed: 32 }, seed: 32 }); } },
    { depth: 0.1, live: (g, W, H, t) => { const u = U(W, H); for (let i = 0; i < 4; i++) { const x = ((hh(i) * 1.4 + t * 0.012 * (1 + i * 0.4)) % 1.4 - 0.2) * W, y = H * (0.08 + 0.18 * hh(i + 11)); g.fillStyle = 'rgba(236,230,255,0.4)'; for (const [dx, dy, r] of [[0, 0, 0.07], [0.06, 0.01, 0.055], [-0.06, 0.012, 0.05], [0.02, -0.025, 0.05]]) { g.beginPath(); g.ellipse(x + dx * u, y + dy * u, r * u * 1.3, r * u * 0.8, 0, 0, 6.2832); g.fill(); } } } },   // clouds drift
    { depth: 0.3, draw: (g, W, H) => { const tints = ['#b9776a', '#7f9ab5', '#c9a35e', '#8aa57d', '#a98ab0', '#d08b6a']; for (let i = 0; i < 6; i++) house(g, W * (0.02 + i * 0.2), H * 0.66, U(W, H) * (0.075 + (i % 3) * 0.012), 40 + i, tints[i]); } },
    { depth: 0.5, draw: (g, W, H) => { shape(g, rectPts(-W * 0.4, H * 0.66, W * 1.8, H * 0.6), { fill: '#6a6f86', line: { width: 3, seed: 50 }, seed: 50 }); shape(g, rectPts(-W * 0.4, H * 0.66, W * 1.8, H * 0.05), { fill: '#a8a39a', line: { width: 3, seed: 51 }, seed: 51 });
      for (let i = 0; i < 40; i++) pencil(g, [[W * ((i * 0.0731) % 1.4 - 0.2), H * (0.74 + (i % 5) * 0.05)], [W * ((i * 0.0731) % 1.4 - 0.2) + 24, H * (0.74 + (i % 5) * 0.05)]], { width: 2, passes: 1, alpha: 0.4, seed: i }); } },
    { depth: 0.32, live: (g, W, H, t) => { const u = U(W, H); for (const hx of [0.2, 0.6]) for (let j = 0; j < 5; j++) { const ph = (t * 0.35 + j * 0.2) % 1; g.fillStyle = `rgba(230,228,240,${0.35 * (1 - ph)})`; g.beginPath(); g.arc(W * (hx + 0.045) + ph * 40 * u / 1080 + Math.sin(ph * 6 + j) * 8, H * 0.5 - ph * 0.12 * H, (8 + ph * 26) * u / 1080, 0, 6.2832); g.fill(); } } },   // chimney smoke
    { depth: 0.65, figures: true },
    { depth: 0.9, draw: (g, W, H) => { streetLamp(g, W * 0.1, H * 0.95, U(W, H) * 0.13, 60); tree(g, W * 0.92, H * 0.97, U(W, H) * 0.2, 61); } },
    { depth: 1.15, live: (g, W, H, t) => { const u = U(W, H); for (let i = 0; i < 12; i++) { const x = W * (hh(i) * 1.3 - 0.1) + Math.sin(t * 0.9 + i * 2) * 60, y = H * (0.45 + 0.5 * hh(i + 30)) + Math.cos(t * 0.7 + i) * 40, a = 0.5 + 0.5 * Math.sin(t * 4 + i * 3); glow(g, x, y, 22 * u / 1080, '255,235,140', 0.7 * a); } } },   // fireflies
  ],
};
export const SKETCH_SETS = { ...BASE_SETS, ...SKETCH_SETS_MORE };
export const SKETCH_SET_NAMES = Object.keys(SKETCH_SETS);
