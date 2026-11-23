// Flat 2D stick-figure rig drawn as a billboard. Units: metres * s (pixels per metre). Origin = feet. y up is negative.
const lerp = (a, b, k) => a + (b - a) * k;
/** Blend two numeric dictionaries (pose/face) by k — never switch poses with an if. */
export const blend = (a, b, k) => Object.fromEntries(Object.keys(a).map(key => [key, lerp(a[key], b[key], k)]));

export const POSES = {
  idle:  { lean: 0, armL: 0.35, armR: -0.35, bob: 0, step: 0 },
  smug:  { lean: -0.06, armL: 0.9, armR: -0.2, bob: 0.01, step: 0 },
};
export const FACES = {
  flat:  { open: 0, smile: 0, brow: 0, lid: 0.0, wide: 0 },
  smug:  { open: 0, smile: 0.9, brow: -0.4, lid: 0.55, wide: 0 },
  shock: { open: 1, smile: 0, brow: 0.8, lid: 0, wide: 1 },
};

export function drawStick(ctx, { x, y, s, pose = POSES.idle, face = FACES.flat, jumpsuit = '#e8731c', hat = false, toque = false, shades = false, mug = false }) {
  const m = v => v * s, ol = Math.max(3, s * 0.035);
  ctx.save();
  ctx.translate(x, y + m(pose.bob || 0));
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  // contact shadow
  ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0, m(0.02), m(0.5), m(0.12), 0, 0, 6.2832); ctx.fill();
  // legs
  ctx.strokeStyle = '#2a1d16'; ctx.lineWidth = ol * 1.4;
  const sp = (pose.step || 0) * 0.25;
  for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.moveTo(m(0.12 * sgn), m(-0.62)); ctx.lineTo(m(0.2 * sgn + sp * sgn), m(0)); ctx.stroke(); }
  // torso (leans from the hips)
  ctx.save(); ctx.translate(0, m(-0.62)); ctx.rotate(pose.lean || 0);
  ctx.fillStyle = jumpsuit; ctx.strokeStyle = '#2a1d16'; ctx.lineWidth = ol;
  ctx.beginPath(); ctx.roundRect(m(-0.3), m(-0.9), m(0.6), m(0.95), m(0.22)); ctx.fill(); ctx.stroke();
  // arms
  ctx.lineWidth = ol * 1.4;
  const hand = (sgn, a) => [m(0.3 * sgn + sgn * Math.sin(a) * 0.55), m(-0.75 + Math.cos(a) * 0.55)];
  for (const [sgn, a] of [[-1, pose.armL], [1, pose.armR]]) {
    const [hx, hy] = hand(sgn, a); ctx.beginPath(); ctx.moveTo(m(0.3 * sgn), m(-0.75)); ctx.lineTo(hx, hy); ctx.stroke();
  }
  if (mug) { const [hx, hy] = hand(-1, pose.armL);
    ctx.fillStyle = '#c4382b'; ctx.lineWidth = ol; ctx.beginPath(); ctx.roundRect(hx - m(0.1), hy - m(0.16), m(0.2), m(0.22), m(0.04)); ctx.fill(); ctx.stroke(); }
  // head
  const hr = 0.36; ctx.translate(0, m(-0.98));
  ctx.fillStyle = '#fbf6ee'; ctx.lineWidth = ol; ctx.beginPath(); ctx.arc(0, m(-hr), m(hr), 0, 6.2832); ctx.fill(); ctx.stroke();
  ctx.translate(0, m(-hr));
  const eyeY = m(-0.04), ex = m(0.14), er = m(0.07 + 0.05 * face.wide);
  if (shades) {
    ctx.fillStyle = '#17233a'; for (const sgn of [-1, 1]) { ctx.beginPath(); ctx.roundRect(ex * sgn - m(0.11), eyeY - m(0.07), m(0.22), m(0.14), m(0.04)); ctx.fill(); }
    ctx.lineWidth = ol * 0.8; ctx.beginPath(); ctx.moveTo(-ex + m(0.11), eyeY - m(0.03)); ctx.lineTo(ex - m(0.11), eyeY - m(0.03)); ctx.stroke();
  } else for (const sgn of [-1, 1]) {
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex * sgn, eyeY, er, 0, 6.2832); ctx.fill(); ctx.lineWidth = ol * 0.7; ctx.stroke();
    ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(ex * sgn + m(0.015) * face.smile, eyeY + m(0.015), er * 0.45, 0, 6.2832); ctx.fill();
    if (face.lid > 0) { ctx.fillStyle = '#fbf6ee'; ctx.beginPath(); ctx.rect(ex * sgn - er - 1, eyeY - er - 1, er * 2 + 2, (er * 2) * face.lid * 0.55 + 1); ctx.fill(); ctx.beginPath(); ctx.moveTo(ex * sgn - er, eyeY - er + er * 2 * face.lid * 0.55); ctx.lineTo(ex * sgn + er, eyeY - er + er * 2 * face.lid * 0.55); ctx.stroke(); }
  }
  ctx.lineWidth = ol; ctx.beginPath();                         // brows: brow>0 raises the inner ends (worried), <0 lowers them (smug/angry)
  for (const sgn of [-1, 1]) { const by = eyeY - m(0.15 + 0.03 * face.wide);
    ctx.moveTo(ex * sgn - sgn * m(0.09), by - m(0.045) * face.brow); ctx.lineTo(ex * sgn + sgn * m(0.09), by + m(0.045) * face.brow); }
  ctx.stroke();
  ctx.beginPath();                                               // mouth
  if (face.open > 0.5) { ctx.fillStyle = '#3a1a1a'; ctx.ellipse(0, m(0.17), m(0.07), m(0.1 * face.open), 0, 0, 6.2832); ctx.fill(); ctx.stroke(); }
  else { ctx.moveTo(-m(0.1), m(0.15)); ctx.quadraticCurveTo(m(0.02 * face.smile), m(0.15 + 0.12 * face.smile), m(0.12 + 0.04 * face.smile), m(0.15 - 0.05 * face.smile)); ctx.stroke(); }
  if (hat) { ctx.fillStyle = '#1b2438'; ctx.beginPath(); ctx.roundRect(-m(0.38), -m(0.46), m(0.76), m(0.2), m(0.06)); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.roundRect(-m(0.3), -m(0.62), m(0.6), m(0.2), m(0.08)); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#e0b341'; ctx.beginPath(); ctx.arc(0, -m(0.52), m(0.05), 0, 6.2832); ctx.fill(); }
  if (toque) { ctx.fillStyle = '#fffdf6'; ctx.lineWidth = ol; ctx.beginPath(); ctx.roundRect(-m(0.3), -m(0.52), m(0.6), m(0.14), m(0.05)); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, -m(0.78), m(0.34), m(0.3), 0, 0, 6.2832); ctx.fill(); ctx.stroke(); }
  ctx.restore(); ctx.restore();
}
