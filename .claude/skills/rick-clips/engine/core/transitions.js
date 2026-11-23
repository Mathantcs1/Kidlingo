// Transition helpers. Pure: shotAt, crossfade. Impure (draws on a 2D canvas): cctvOverlay.
import { smoothstep } from './camera.js';

/** The shot active at time t. Hard cuts land exactly on shot.t0; clamps to first/last shot outside the film. */
export function shotAt(shots, t) {
  if (t < shots[0].t0) return shots[0];
  for (const s of shots) if (t >= s.t0 && t < s.t1) return s;
  return shots[shots.length - 1];
}

/** Alpha 0→1 over [t0,t1] (smoothstep), clamped. */
export function crossfade(t0, t1) {
  return t => smoothstep(Math.min(1, Math.max(0, (t - t0) / (t1 - t0))));
}

/** CCTV-monitor frame over the picture: scanlines, REC dot (blinks at 1 Hz), camera label, fixed date and a running clock. */
export function cctvOverlay(ctx, w, h, t, label, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(10,30,20,0.28)';
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(0,0,0,0.18)';
  for (let y = 0; y < h; y += 6) ctx.fillRect(0, y, w, 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = Math.max(2, w * 0.004);
  const m = w * 0.06, c = w * 0.08;
  for (const [x, y, dx, dy] of [[m, m * 1.6, 1, 1], [w - m, m * 1.6, -1, 1], [m, h - m * 3.2, 1, -1], [w - m, h - m * 3.2, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(x, y + dy * c); ctx.lineTo(x, y); ctx.lineTo(x + dx * c, y); ctx.stroke();
  }
  const fs = Math.round(w * 0.036);
  ctx.font = `700 ${fs}px "DejaVu Sans Mono", monospace`;
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'top'; ctx.textAlign = 'left';   // callers may have left another alignment on the context
  ctx.fillText(label, m * 1.3, m * 1.9);
  if (Math.floor(t * 2) % 2 === 0) { ctx.fillStyle = '#ff2a2a'; ctx.beginPath(); ctx.arc(w - m * 3.1, m * 1.9 + fs * 0.5, fs * 0.28, 0, 6.2832); ctx.fill(); }
  ctx.fillStyle = '#fff'; ctx.fillText('REC', w - m * 2.6, m * 1.9);
  const s = Math.floor(t) % 60, mm = 47 + Math.floor(t / 60);
  ctx.fillText(`11/19/2026 02:${mm}:${String(s).padStart(2, '0')}`, m * 1.3, h - m * 3.2 - fs * 1.6);
  ctx.restore();
}

/** Half-width in seconds of each transition. A transition is centred on the boundary (the first spoken word), so the word lands mid-transition. */
export const TRANSITION_HALF = { fade: 0.25, whip: 0.18, punch: 0.14, cctv: 0.12, scribble: 0.22, flip: 0.3, ink: 0.26 };

/** The transition active at time t, or null: {type, prev, next, k} with k 0→1 across the window. First shot and hard cuts never open one. */
export function transitionWindow(shots, t) {
  for (let i = 1; i < shots.length; i++) {
    const h = TRANSITION_HALF[shots[i].transition];
    if (!h) continue;
    const t0 = shots[i].t0;
    if (t >= t0 - h && t < t0 + h) return { type: shots[i].transition, prev: shots[i - 1], next: shots[i], k: (t - (t0 - h)) / (2 * h) };
  }
  return null;
}
