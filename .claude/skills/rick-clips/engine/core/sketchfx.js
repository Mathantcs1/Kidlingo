// Sketch transitions, composited from two finished frames A (old shot) and B (new shot) on a W x H canvas context.
// k runs 0 -> 1 across the transition window (centred on the first spoken word). focus = {x, y} screen point the ink bleeds from.
import { pencil, rng } from './sketch.js';
const ss = x => x * x * (3 - 2 * x), eio = k => k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;

export function composite(c, A, B, type, k, W, H, focus = { x: W / 2, y: H / 2 }) {
  c.clearRect(0, 0, W, H);
  if (type === 'fade') { c.drawImage(A, 0, 0); c.globalAlpha = ss(k); c.drawImage(B, 0, 0); c.globalAlpha = 1; }
  else if (type === 'whip') {   // slide wipe with a horizontal motion STREAK (translucent trailing copies), so the picture stays crisp vertically
    const e = eio(k), amp = Math.sin(Math.PI * k) * W * 0.008;
    for (const [img, x0] of [[A, -e * W], [B, (1 - e) * W]]) { c.drawImage(img, x0, 0); c.save(); for (let i = 1; i <= 4; i++) { c.globalAlpha = 0.1 / i; c.drawImage(img, x0 - amp * i / 4, 0); c.drawImage(img, x0 + amp * i / 4, 0); } c.restore(); }
  }
  else if (type === 'scribble') scribble(c, A, B, k, W, H);
  else if (type === 'flip') flip(c, A, B, k, W, H);
  else if (type === 'ink') ink(c, A, B, k, W, H, focus);
  else c.drawImage(k < 0.5 ? A : B, 0, 0);
}

/** Pencil scribble wipe: a zig-zag front sweeps left to right, the new shot appears behind it and the graphite scrawl is left on the edge. */
function scribble(c, A, B, k, W, H) {
  const front = -0.15 * W + eio(k) * 1.3 * W, rows = 34, step = H / rows, r = rng(4), edge = [];
  for (let i = 0; i <= rows; i++) edge.push([front + (i % 2 ? 0.07 : -0.07) * W + (r() - 0.5) * 0.03 * W, i * step]);
  c.drawImage(A, 0, 0);
  c.save(); c.beginPath(); c.moveTo(0, 0); edge.forEach(([x, y]) => c.lineTo(x, y)); c.lineTo(0, H); c.closePath(); c.clip(); c.drawImage(B, 0, 0); c.restore();
  for (let p = 0; p < 3; p++) pencil(c, edge.map(([x, y]) => [x + p * 14 - 14, y]), { width: 6 - p, seed: 5 + p, amp: 3, passes: 2, alpha: 0.8 });
}

/** Page turn: the old page folds away to the left, shaded where it curls, revealing the new page beneath. */
function flip(c, A, B, k, W, H) {
  const e = ss(k), x = W * (1 - e);
  c.drawImage(B, 0, 0);
  const sh = c.createLinearGradient(x, 0, x + W * 0.22, 0); sh.addColorStop(0, `rgba(40,25,10,${0.38 * (1 - e)})`); sh.addColorStop(1, 'rgba(40,25,10,0)');
  c.fillStyle = sh; c.fillRect(x, 0, W * 0.22, H);
  c.drawImage(A, 0, 0, W, H, 0, 0, x, H);
  const curl = Math.max(2, W * 0.09 * Math.sin(Math.PI * e)), g = c.createLinearGradient(x - curl, 0, x, 0);   // the curl: paper back + shade
  g.addColorStop(0, '#efe5cf'); g.addColorStop(1, '#bfae8c'); c.fillStyle = g; c.fillRect(x - curl, 0, curl, H);
  c.strokeStyle = 'rgba(58,52,47,0.55)'; c.lineWidth = 3; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, H); c.stroke();
}

/** Ink bleed: the new shot spreads from the character through an uneven blot, its edge a dark inked ring. */
function ink(c, A, B, k, W, H, f) {
  const R = Math.hypot(Math.max(f.x, W - f.x), Math.max(f.y, H - f.y)) * 1.1 * eio(k), r = rng(9), n = 72, pts = [];
  const bump = Array.from({ length: n }, () => 0.9 + r() * 0.2);
  for (let i = 0; i <= n; i++) { const a = i / n * Math.PI * 2, rr = R * (0.94 + 0.1 * Math.sin(a * 5 + 1) + 0.06 * (bump[i % n] - 0.9) * 5); pts.push([f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr]); }
  c.drawImage(A, 0, 0);
  c.save(); c.beginPath(); pts.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.closePath(); c.clip(); c.drawImage(B, 0, 0); c.restore();
  pencil(c, pts, { color: '#1d1a18', width: 16 * Math.sin(Math.PI * Math.min(1, k * 1.1)) + 3, seed: 3, amp: 4, passes: 2, alpha: 0.9 });
  if (k > 0.02 && k < 0.95) for (let i = 0; i < 10; i++) { const a = (i * 2.399) % (Math.PI * 2), rr = R * (1.02 + 0.05 * ((i * 7) % 3)); c.fillStyle = 'rgba(29,26,24,0.85)'; c.beginPath(); c.arc(f.x + Math.cos(a) * rr, f.y + Math.sin(a) * rr, 5 + (i % 4) * 3, 0, 6.2832); c.fill(); }   // ink splatter
}
