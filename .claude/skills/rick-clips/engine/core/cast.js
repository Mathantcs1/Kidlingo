// Original sketchbook cast. Origin = centre of the feet; y up is negative; units are metres * s (pixels per metre).
import { shape, pencil, curvePts, ellipsePts, roundRectPts } from './sketch.js';

export const CAST = {
  rosa: { skin: '#c98b62', hair: '#3b2a24', hairStyle: 'bun', top: '#c4553a', extra: '#f3e8cf', accent: '#2f8f8a', boots: '#5a3b2a', outfit: 'dress', height: 1 },
  dario: { skin: '#efc9a3', hair: '#4a3a2e', hairStyle: 'toque', top: '#f6f1e6', extra: '#b3302f', accent: '#b3302f', boots: '#3b3b3b', outfit: 'chef', height: 1.08, moustache: true },
  tomas: { skin: '#d9a47c', hair: '#c9c4ba', hairStyle: 'cap', top: '#5b7a99', extra: '#e8dcc2', accent: '#7a5a46', boots: '#4a3a2f', outfit: 'coat', height: 0.95, glasses: true, moustache: true, mcolor: '#bdb7ae' },
  bea: { skin: '#f0c9a8', hair: '#7a3b2a', hairStyle: 'curls', top: '#7a5aa6', extra: '#f1d36b', accent: '#f1d36b', boots: '#8a3b3b', outfit: 'dress', height: 1.05 },
  omar: { skin: '#7a4f35', hair: '#201a18', hairStyle: 'cap', top: '#3f7f5a', extra: '#e8dcc2', accent: '#2f8f8a', boots: '#3b3b3b', outfit: 'coat', height: 1.02 },
  lila: { skin: '#d9a47c', hair: '#1c1c24', hairStyle: 'curls', top: '#d9453d', extra: '#f3e8cf', accent: '#f3e8cf', boots: '#2f6fb0', outfit: 'dress', height: 0.98 },
  sam: { skin: '#f0c9a8', hair: '#8a5a2a', hairStyle: 'pigtails', top: '#3f6fb0', extra: '#f1c93b', accent: '#f1c93b', boots: '#8a3b3b', outfit: 'coat', height: 0.72 },
  nora: { skin: '#b9835a', hair: '#c9c4ba', hairStyle: 'bun', top: '#8a5aa6', extra: '#f3e8cf', accent: '#e8b923', boots: '#4a3a2f', outfit: 'dress', height: 0.96 },
  mina: { skin: '#a8714a', hair: '#241a18', hairStyle: 'pigtails', top: '#e8b923', extra: '#d9453d', accent: '#d9453d', boots: '#2f6fb0', outfit: 'coat', height: 0.68 },
};
export const POSES = {
  idle: { lean: 0, armL: 0.28, armR: 0.28, fold: 0, bob: 0, step: 0 },   // arm angle: 0 = hanging, + = swung outward/up; fold bends the forearm in
  proud: { lean: -0.06, armL: 1.15, armR: 1.15, fold: 0.95, bob: 0, step: 0 },   // fists on hips, chest out
  wave: { lean: 0.02, armL: 0.28, armR: 2.5, fold: 0, bob: 0, step: 0 },
};
export const FACES = {
  neutral: { open: 0, smile: 0.15, brow: 0, lid: 0, wide: 0, squint: 0 },
  smug: { open: 0, smile: 0.85, brow: -0.5, lid: 0.5, wide: 0, squint: 0 },
  shock: { open: 1, smile: 0, brow: 0.9, lid: 0, wide: 1, squint: 0 },
  joy: { open: 0.35, smile: 1, brow: 0.3, lid: 0, wide: 0, squint: 1 },
};
const INK = '#3a342f';

function limb(ctx, pts, w, fill, s, seed) {   // capsule through 3 points
  const side = sg => pts.map((p, i) => { const q = pts[Math.min(i + 1, 2)], o = pts[Math.max(i - 1, 0)], dx = q[0] - o[0], dy = q[1] - o[1], l = Math.hypot(dx, dy) || 1; return [p[0] - sg * dy / l * w / 2 * s, p[1] + sg * dx / l * w / 2 * s]; });
  const poly = curvePts([...side(1), ...side(-1).reverse()], { closed: true, seg: 4 });
  shape(ctx, poly, { fill, line: { width: 2.4, seed }, seed });
}

export function drawCharacter(ctx, who, { x, y, s, pose = POSES.idle, face = FACES.neutral, turn = 0, seed = 1 } = {}) {
  const c = CAST[who], k = s * c.height, P = (px, py) => [x + px * k, y + py * k];
  const pts = a => a.map(([px, py]) => P(px, py));
  ctx.save();
  ctx.fillStyle = 'rgba(60,45,30,0.2)'; ctx.beginPath(); ctx.ellipse(x, y + 0.02 * k, 0.5 * k, 0.1 * k, 0, 0, 6.2832); ctx.fill();   // contact shadow
  const sway = (pose.lean || 0), hip = [0, -0.5 + (pose.bob || 0)];
  for (const sg of [-1, 1]) {   // legs + boots
    const lx = sg * 0.13 + (pose.step || 0) * sg * 0.1;
    limb(ctx, [P(sg * 0.1, hip[1]), P(lx, -0.28), P(lx, -0.08)], 0.1, c.outfit === 'chef' ? '#3d3a44' : '#7a5a46', k, seed + sg);
    shape(ctx, curvePts([P(lx - 0.1, -0.1), P(lx + 0.12, -0.1), P(lx + 0.16, 0), P(lx - 0.1, 0)], { closed: true }), { fill: c.boots, line: { width: 2.6, seed: seed + 3 + sg }, seed });
  }
  const body = c.outfit === 'dress' ? [[-0.24, -1.08], [0.24, -1.08], [0.38, -0.45], [-0.38, -0.45]]
    : c.outfit === 'chef' ? [[-0.34, -1.1], [0.34, -1.1], [0.36, -0.7], [0.3, -0.45], [-0.3, -0.45], [-0.36, -0.7]]
    : [[-0.26, -1.06], [0.26, -1.06], [0.34, -0.5], [-0.34, -0.5]];
  const tilt = ([px, py]) => [px + sway * (-1.1 - py) * 0.6, py];
  const torso = curvePts(body.map(tilt).map(([px, py]) => P(px, py)), { closed: true, seg: 5 });
  const late = [];   // raised or folded arms are drawn after the torso so they read in front of it
  const arm = (sg, a) => {
    const sh = tilt([sg * 0.27, -1.0]), d1 = [sg * Math.sin(a), Math.cos(a)], el = [sh[0] + d1[0] * 0.3, sh[1] + d1[1] * 0.3];
    const f = pose.fold || 0, d2 = [-sg * 0.55, 0.85], d = [d1[0] + (d2[0] - d1[0]) * f, d1[1] + (d2[1] - d1[1]) * f], l = Math.hypot(...d), hd = [el[0] + d[0] / l * 0.3, el[1] + d[1] / l * 0.3];
    limb(ctx, [P(...sh), P(...el), P(...hd)], 0.1, c.top, k, seed + 9 + sg);
    shape(ctx, ellipsePts(...P(...hd), 0.065 * k, 0.065 * k, 12), { fill: c.skin, line: { width: 2.2, seed }, seed });
  };
  for (const [sg, a] of [[-1, pose.armL], [1, pose.armR]]) ((pose.fold || 0) > 0.5 || a > 1.8 ? late.push(() => arm(sg, a)) : arm(sg, a));
  shape(ctx, torso, { fill: c.top, line: { width: 3, seed }, hatchOpts: { gap: 10, alpha: 0.28 }, seed });
  if (c.outfit === 'dress') shape(ctx, curvePts(pts([[-0.2, -0.95], [0.2, -0.95], [0.27, -0.5], [-0.27, -0.5]]), { closed: true }), { fill: c.extra, line: { width: 2.4, seed }, seed });   // apron
  if (c.outfit === 'chef') { shape(ctx, curvePts(pts([[-0.14, -1.1], [0.14, -1.1], [0, -0.92]]), { closed: true }), { fill: c.extra, line: { width: 2.2, seed }, seed }); }   // neckerchief
  if (c.outfit === 'coat') for (let i = 0; i < 3; i++) pencil(ctx, [P(0, -0.95 + i * 0.14), P(0.01, -0.9 + i * 0.14)], { width: 4, seed: seed + i, passes: 1 });   // buttons
  late.forEach(f => f());
  // head (slides features sideways with `turn`: the 2.5D head-turn)
  const hc = tilt([0, -1.43]), H = P(hc[0] + turn * 0.03, hc[1]);
  pencil(ctx, pts([[hc[0] - 0.07, -1.12], [hc[0] - 0.05, -1.07]]), { width: 3, seed, passes: 1 });
  drawHair(ctx, c, H, k, seed, true);
  shape(ctx, ellipsePts(H[0], H[1], 0.33 * k, 0.37 * k, 28), { fill: c.skin, line: { width: 3.2, seed }, seed });
  drawFace(ctx, c, H, k, face, turn, seed);
  drawHair(ctx, c, H, k, seed, false);
  ctx.restore();
}

function drawHair(ctx, c, H, k, seed, back) {
  const [hx, hy] = H;
  if (c.hairStyle === 'bun') {
    if (back) { shape(ctx, ellipsePts(hx, hy - 0.04 * k, 0.37 * k, 0.4 * k, 24), { fill: c.hair, line: { width: 2.6, seed }, seed }); shape(ctx, ellipsePts(hx, hy - 0.5 * k, 0.17 * k, 0.15 * k, 16), { fill: c.hair, line: { width: 2.6, seed: seed + 2 }, seed }); }
    else { shape(ctx, curvePts([[hx - 0.34 * k, hy - 0.08 * k], [hx - 0.2 * k, hy - 0.36 * k], [hx + 0.2 * k, hy - 0.36 * k], [hx + 0.34 * k, hy - 0.08 * k], [hx + 0.1 * k, hy - 0.22 * k], [hx - 0.1 * k, hy - 0.22 * k]], { closed: true }), { fill: c.accent, line: { width: 2.4, seed }, seed }); }   // headscarf band
  } else if (c.hairStyle === 'toque') {
    if (!back) { shape(ctx, roundRectPts(hx - 0.29 * k, hy - 0.5 * k, 0.58 * k, 0.17 * k, 0.05 * k), { fill: '#fffdf6', line: { width: 2.6, seed }, seed }); shape(ctx, curvePts([[hx - 0.3 * k, hy - 0.5 * k], [hx - 0.32 * k, hy - 0.72 * k], [hx - 0.12 * k, hy - 0.85 * k], [hx + 0.12 * k, hy - 0.85 * k], [hx + 0.32 * k, hy - 0.72 * k], [hx + 0.3 * k, hy - 0.5 * k]], { closed: true }), { fill: '#fffdf6', line: { width: 2.6, seed: seed + 2 }, hatchOpts: { gap: 12, alpha: 0.2 }, seed }); }
  } else if (c.hairStyle === 'cap') {
    if (!back) { shape(ctx, curvePts([[hx - 0.34 * k, hy - 0.12 * k], [hx - 0.22 * k, hy - 0.4 * k], [hx + 0.22 * k, hy - 0.4 * k], [hx + 0.34 * k, hy - 0.12 * k], [hx + 0.5 * k, hy - 0.1 * k], [hx - 0.1 * k, hy - 0.06 * k]], { closed: true }), { fill: c.accent, line: { width: 2.6, seed }, seed }); }
    else for (const sg of [-1, 1]) shape(ctx, ellipsePts(hx + sg * 0.33 * k, hy + 0.05 * k, 0.06 * k, 0.12 * k, 10), { fill: c.hair, line: { width: 2.2, seed: seed + sg }, seed });
  } else if (c.hairStyle === 'curls') {
    if (back) for (let i = 0; i < 9; i++) { const a = Math.PI * (0.95 + i * 0.14); shape(ctx, ellipsePts(hx + Math.cos(a) * 0.36 * k, hy - 0.02 * k + Math.sin(a) * 0.4 * k, 0.12 * k, 0.12 * k, 10), { fill: c.hair, line: { width: 2.4, seed: seed + i }, seed }); }
    else shape(ctx, curvePts([[hx - 0.3 * k, hy - 0.12 * k], [hx - 0.18 * k, hy - 0.34 * k], [hx + 0.18 * k, hy - 0.34 * k], [hx + 0.3 * k, hy - 0.12 * k], [hx + 0.1 * k, hy - 0.22 * k], [hx - 0.1 * k, hy - 0.22 * k]], { closed: true }), { fill: c.hair, line: { width: 2.4, seed }, seed });
  } else if (c.hairStyle === 'pigtails') {
    if (back) for (const sg of [-1, 1]) shape(ctx, ellipsePts(hx + sg * 0.33 * k, hy + 0.24 * k, 0.08 * k, 0.17 * k, 14), { fill: c.hair, line: { width: 2.4, seed: seed + sg }, seed });
    else { shape(ctx, curvePts([[hx - 0.33 * k, hy - 0.05 * k], [hx - 0.25 * k, hy - 0.33 * k], [hx + 0.25 * k, hy - 0.33 * k], [hx + 0.33 * k, hy - 0.05 * k], [hx + 0.12 * k, hy - 0.2 * k], [hx - 0.12 * k, hy - 0.2 * k]], { closed: true }), { fill: c.hair, line: { width: 2.4, seed }, seed });
      for (const sg of [-1, 1]) shape(ctx, ellipsePts(hx + sg * 0.31 * k, hy + 0.06 * k, 0.045 * k, 0.045 * k, 10), { fill: c.accent, line: { width: 2, seed }, seed }); }
  }
}

function drawFace(ctx, c, H, k, f, turn, seed) {
  const [hx, hy] = H, tx = turn * 0.1 * k;
  const ew = (0.07 + 0.03 * f.wide) * k, eh = (0.085 + 0.03 * f.wide) * k * (1 - 0.8 * f.squint);
  for (const sg of [-1, 1]) {
    const far = sg * turn > 0.2, ex = hx + sg * 0.135 * k * (1 - 0.3 * Math.abs(turn)) + tx, ey = hy - 0.02 * k, sw = far ? 0.8 : 1;
    if (f.squint) { pencil(ctx, curvePts([[ex - ew, ey], [ex, ey - eh * 2.4], [ex + ew, ey]]), { width: 3, seed: seed + sg, passes: 1 }); }
    else {
      shape(ctx, ellipsePts(ex, ey, ew * sw, eh, 14), { fill: '#fffdf8', line: { width: 2, seed: seed + sg }, seed });
      ctx.fillStyle = '#2a211c'; ctx.beginPath(); ctx.arc(ex + turn * 0.03 * k + f.smile * 0.01 * k, ey + 0.015 * k, ew * 0.5 * sw, 0, 6.2832); ctx.fill();
      if (f.lid > 0) { ctx.fillStyle = c.skin; ctx.beginPath(); ctx.rect(ex - ew - 1, ey - eh - 1, ew * 2 + 2, eh * 2 * f.lid * 0.7); ctx.fill(); pencil(ctx, [[ex - ew, ey - eh + eh * 2 * f.lid * 0.7], [ex + ew, ey - eh + eh * 2 * f.lid * 0.7]], { width: 2.4, seed, passes: 1 }); }
    }
    const by = ey - (0.14 + 0.03 * f.wide) * k, lift = f.brow * 0.05 * k;   // brows: inner end raised for worry, lowered for smug/angry
    pencil(ctx, [[ex - sg * ew * 1.2, by - lift], [ex + sg * ew * 1.2, by + lift]], { width: 3.4, seed: seed + 5 + sg, passes: 1 });
    if (f.smile > 0.3) { ctx.fillStyle = 'rgba(230,110,100,0.32)'; ctx.beginPath(); ctx.ellipse(ex + sg * 0.03 * k, ey + 0.17 * k, 0.07 * k, 0.045 * k, 0, 0, 6.2832); ctx.fill(); }   // blush
  }
  pencil(ctx, [[hx + tx - 0.01 * k, hy + 0.03 * k], [hx + tx + 0.03 * k, hy + 0.09 * k], [hx + tx - 0.01 * k, hy + 0.1 * k]], { width: 2.2, seed, passes: 1 });   // nose
  const my = hy + 0.2 * k;
  if (f.open > 0.5) shape(ctx, ellipsePts(hx + tx, my + 0.03 * k, 0.06 * k, 0.085 * k * f.open, 14), { fill: '#7a2f2a', line: { width: 2.4, seed }, seed });
  else pencil(ctx, curvePts([[hx + tx - 0.1 * k, my - f.smile * 0.01 * k], [hx + tx, my + f.smile * 0.07 * k], [hx + tx + 0.12 * k, my - f.smile * 0.04 * k]]), { width: 2.8, seed, passes: 1 });
  if (c.glasses) for (const sg of [-1, 1]) pencil(ctx, ellipsePts(hx + sg * 0.135 * k * (1 - 0.3 * Math.abs(turn)) + tx, hy - 0.02 * k, 0.1 * k, 0.1 * k, 16), { width: 2.4, seed: seed + sg, passes: 1 });
  if (c.moustache) shape(ctx, curvePts([[hx + tx - 0.2 * k, my - 0.07 * k], [hx + tx - 0.08 * k, my - 0.1 * k], [hx + tx, my - 0.06 * k], [hx + tx + 0.08 * k, my - 0.1 * k], [hx + tx + 0.2 * k, my - 0.07 * k], [hx + tx + 0.1 * k, my - 0.03 * k], [hx + tx - 0.1 * k, my - 0.03 * k]], { closed: true }), { fill: c.mcolor || '#3a2c22', line: { width: 2, seed }, seed });
}
