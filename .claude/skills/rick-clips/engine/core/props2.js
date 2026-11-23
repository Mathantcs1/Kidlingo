// More sketched objects for the story scenes. Origin = bottom-centre unless noted; s = px per metre.
import { shape, pencil, curvePts, ellipsePts, roundRectPts, rectPts, hatch } from './sketch.js';
const at = (x, y, s) => (px, py) => [x + px * s, y + py * s];
const INK = '#3a342f';

/** Hand lettering: italic bold text with a soft graphite shadow. (x, y) = centre. */
export function hand(g, text, x, y, size, { color = INK, rot = 0 } = {}) {
  g.save(); g.translate(x, y); g.rotate(rot); g.font = `italic 800 ${size}px "DejaVu Sans", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = 'rgba(58,52,47,.25)'; g.fillText(text, 2, 3); g.fillStyle = color; g.fillText(text, 0, 0); g.restore();
}
export function shopFront(g, x, y, s, seed = 1, { text = "ROSA'S", lit = true } = {}) {
  const P = at(x, y, s);
  shape(g, rectPts(...P(-1.6, -3.4), 3.2 * s, 3.4 * s), { fill: '#c98f6a', line: { width: 4, seed }, hatchOpts: { gap: 13, alpha: 0.2 }, seed });
  shape(g, curvePts([P(-1.9, -3.4), P(1.9, -3.4), P(1.7, -2.7), P(-1.7, -2.7)], { closed: true }), { fill: '#d9453d', line: { width: 3.4, seed: seed + 1 }, seed });   // awning
  for (let i = -3; i <= 3; i += 2) pencil(g, [P(i * 0.27, -3.4), P(i * 0.25, -2.72)], { width: 8, color: '#fff3e0', passes: 1, alpha: 0.9, seed: seed + i });
  shape(g, roundRectPts(...P(-1.1, -2.55), 2.2 * s, 0.7 * s, 0.1 * s), { fill: lit ? '#f6e3a0' : '#7d725c', line: { width: 3.4, seed: seed + 2 }, seed });   // sign board
  hand(g, text, ...P(0, -2.2), 0.42 * s, { color: lit ? '#8a2f2a' : '#4a4338' });
  shape(g, roundRectPts(...P(-0.35, -1.7), 0.7 * s, 1.7 * s, 0.1 * s), { fill: '#5d7c8a', line: { width: 3.2, seed: seed + 3 }, seed });   // door
  for (const sx of [-1, 1]) shape(g, rectPts(...P(sx * 0.95 - 0.35, -1.6), 0.7 * s, 0.8 * s), { fill: lit ? '#ffe39a' : '#2c3b66', line: { width: 3, seed: seed + 4 + sx }, seed });   // windows
}
export function wallClock(g, x, y, s, seed = 1, hour = 5, minute = 0) {   // origin = centre
  const P = at(x, y, s), a = f => f * Math.PI * 2 - Math.PI / 2;
  shape(g, ellipsePts(x, y, 0.62 * s, 0.62 * s, 36), { fill: '#fff8e8', line: { width: 6, seed }, seed });
  for (let i = 0; i < 12; i++) pencil(g, [P(Math.cos(a(i / 12)) * 0.5, Math.sin(a(i / 12)) * 0.5), P(Math.cos(a(i / 12)) * 0.57, Math.sin(a(i / 12)) * 0.57)], { width: 3.4, passes: 1, seed: seed + i });
  const mh = (hour % 12 + minute / 60) / 12, mm = minute / 60;
  pencil(g, [P(0, 0), P(Math.cos(a(mh)) * 0.32, Math.sin(a(mh)) * 0.32)], { width: 7, seed: seed + 20 }); pencil(g, [P(0, 0), P(Math.cos(a(mm)) * 0.48, Math.sin(a(mm)) * 0.48)], { width: 4.5, seed: seed + 21 });
  shape(g, ellipsePts(x, y, 0.05 * s, 0.05 * s, 10), { fill: '#d9453d', line: { width: 2, seed }, seed });
}
export function calendarPage(g, x, y, s, seed = 1, crossed = 0, title = 'WEEKS') {   // origin = centre
  const P = at(x, y, s);
  shape(g, roundRectPts(...P(-0.9, -1.1), 1.8 * s, 2.2 * s, 0.08 * s), { fill: '#fffaf0', line: { width: 4, seed }, seed });
  shape(g, rectPts(...P(-0.9, -1.1), 1.8 * s, 0.38 * s), { fill: '#d9453d', line: { width: 3, seed: seed + 1 }, seed }); hand(g, title, ...P(0, -0.91), 0.22 * s, { color: '#fff' });
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
    const i = r * 7 + c, cx = -0.72 + c * 0.24, cy = -0.5 + r * 0.28;
    hand(g, String(i + 1), ...P(cx, cy), 0.12 * s, { color: '#6a5f52' });
    if (i < crossed) pencil(g, [P(cx - 0.09, cy - 0.09), P(cx + 0.09, cy + 0.09)], { width: 4, color: '#d9453d', passes: 1, seed: seed + i }), pencil(g, [P(cx + 0.09, cy - 0.09), P(cx - 0.09, cy + 0.09)], { width: 4, color: '#d9453d', passes: 1, seed: seed + i + 50 });
  }
}
export function wrappedLoaf(g, x, y, s, seed = 1) {
  const P = at(x, y, s);
  shape(g, curvePts([P(-0.34, 0), P(0.34, 0), P(0.38, -0.2), P(0.22, -0.34), P(-0.22, -0.34), P(-0.38, -0.2)], { closed: true }), { fill: '#e9d9b5', line: { width: 3, seed }, hatchOpts: { gap: 9, alpha: 0.25 }, seed });   // paper wrapper
  shape(g, rectPts(...P(-0.13, -0.3), 0.26 * s, 0.2 * s), { fill: '#d9453d', line: { width: 2.4, seed: seed + 1 }, seed }); pencil(g, [P(-0.07, -0.2), P(0, -0.12), P(0.08, -0.26)], { width: 3, color: '#fff', passes: 1, seed });   // label with a tick
  pencil(g, [P(-0.36, -0.14), P(0.36, -0.14)], { width: 3, color: '#8a5a2a', passes: 1, seed: seed + 2 });   // twine
}
export function recipeCard(g, x, y, s, seed = 1) {   // origin = centre
  const P = at(x, y, s);
  shape(g, rectPts(...P(-0.5, -0.65), 1.0 * s, 1.3 * s), { fill: '#fffaf0', line: { width: 3.4, seed }, seed });
  hand(g, 'RECIPE', ...P(0, -0.48), 0.16 * s, { color: '#8a2f2a' });
  for (let i = 0; i < 7; i++) pencil(g, [P(-0.38, -0.25 + i * 0.13), P(0.38 - (i % 3) * 0.1, -0.25 + i * 0.13)], { width: 2.4, passes: 1, alpha: 0.6, seed: seed + i });
  shape(g, ellipsePts(x, y - 0.65 * s, 0.05 * s, 0.05 * s, 10), { fill: '#d9453d', line: { width: 2, seed }, seed });   // pin
}
export function seal(g, x, y, s, seed = 1, pulse = 0) {   // origin = centre; wax seal with a tick
  const R = 0.5 * s * (1 + 0.05 * pulse), pts = Array.from({ length: 25 }, (_, i) => { const a = i / 24 * 6.2832, r = R * (1 + 0.08 * Math.sin(a * 9)); return [x + Math.cos(a) * r, y + Math.sin(a) * r]; });
  shape(g, pts, { fill: '#c9302c', line: { width: 4, seed }, seed });
  pencil(g, curvePts([[x - 0.22 * s, y + 0.02 * s], [x - 0.06 * s, y + 0.18 * s], [x + 0.26 * s, y - 0.2 * s]]), { width: 9, color: '#ffe9c8', seed: seed + 1 });
}
export function bubble(g, x, y, s, seed = 1, icon = 'loaf') {   // origin = bottom tip of the tail
  const P = at(x, y, s);
  shape(g, [...roundRectPts(...P(-0.5, -0.95), 1.0 * s, 0.75 * s, 0.3 * s), ...[P(0.1, -0.2), P(0, 0), P(-0.1, -0.2)]], { fill: '#fffaf0', line: { width: 3.4, seed }, seed });
  if (icon === 'loaf') shape(g, curvePts([P(-0.25, -0.5), P(0.25, -0.5), P(0.28, -0.6), P(0.15, -0.72), P(-0.15, -0.72), P(-0.28, -0.6)], { closed: true }), { fill: '#d9954a', line: { width: 2.4, seed: seed + 1 }, seed });
  else if (icon === 'heart') shape(g, curvePts([P(0, -0.42), P(-0.26, -0.62), P(-0.16, -0.8), P(0, -0.7), P(0.16, -0.8), P(0.26, -0.62)], { closed: true }), { fill: '#d9453d', line: { width: 2.4, seed: seed + 1 }, seed });
  else shape(g, [P(0, -0.82), P(0.07, -0.64), P(0.26, -0.62), P(0.12, -0.5), P(0.17, -0.32), P(0, -0.42), P(-0.17, -0.32), P(-0.12, -0.5), P(-0.26, -0.62), P(-0.07, -0.64), P(0, -0.82)], { fill: '#f1c93b', line: { width: 2.4, seed: seed + 1 }, seed });
}
export function bowl(g, x, y, s, seed = 1) {
  const P = at(x, y, s);
  shape(g, curvePts([P(-0.4, -0.3), P(0.4, -0.3), P(0.3, 0), P(-0.3, 0)], { closed: true }), { fill: '#e8e1d0', line: { width: 3.2, seed }, hatchOpts: { gap: 10, alpha: 0.2 }, seed });
  shape(g, curvePts([P(-0.34, -0.3), P(0, -0.52), P(0.34, -0.3)], { closed: true }), { fill: '#f6efe0', line: { width: 2.6, seed: seed + 1 }, seed });   // dough
}
export function jar(g, x, y, s, seed = 1, fill = '#e8b923') {
  const P = at(x, y, s);
  shape(g, roundRectPts(...P(-0.16, -0.42), 0.32 * s, 0.42 * s, 0.07 * s), { fill: '#dfeef0', line: { width: 2.8, seed }, seed }); shape(g, rectPts(...P(-0.13, -0.3), 0.26 * s, 0.26 * s), { fill, line: { width: 2, seed: seed + 1 }, seed });
  shape(g, rectPts(...P(-0.18, -0.5), 0.36 * s, 0.09 * s), { fill: '#8a5a2a', line: { width: 2.4, seed: seed + 2 }, seed });
}
void hatch;
