// ideatoapps screencast kit: "I'm typing, you're watching". Import in shots: import * as K from '../kit.js';
// Window = browser or terminal frame; grabs are REAL screenshots (assets/manifest.json ids G_*). Deterministic: no Math.random/Date.now.
import { E, ease, clamp, lerp, prog, alpha, mix, rr, glow, linGrad, radGrad, text, measure, wordTime, FONTS } from '/engine/core.js';
import { getStill } from '/engine/stills.js';
import { RECTS } from './sets/rects.js';
export { RECTS };

export const C = { navy: '#0b1230', navy2: '#111c46', navy3: '#1a2650', violet: '#7357f5', blue: '#367cf5', teal: '#16b8b0', ink: '#eef1fb', muted: '#a9b4d0', amber: '#ffb02e', yellow: '#ffd21f', red: '#ff5a6a', link: '#b2a4ff' };
export const MONO = '"DejaVu Sans Mono", "Liberation Mono", Menlo, Consolas, monospace';
export const TAB_NAMES = ['SKETCH', 'DATA', 'UI', 'SERVER', 'WIRE', 'BRAIN', 'AI APP', 'TEST', 'SHIP', 'WATCH'];
export const NAMES = ['SKETCH', 'DATA', 'UI', 'BACKEND', 'AUTOMATE', 'LOCAL AI', 'AI APPS', 'TESTING', 'DEPLOY', 'MONITOR'];
export const STARS = [135.8, 499.4, 128.3, 115.1, 210.6, 187.2, 161.2, 100.3, 66.1, 94.5];   // thousands, github.com on 2026-11-16
export const wt = (w, after, fb) => wordTime(w, after) ?? fb;                                // word start time (global seconds)
export const WIN = { x: 352, y: 112, w: 1216, h: 734, bar: 50 };                              // window incl. chrome; content = 1216x684 (16:9)
export const inner = () => ({ x: WIN.x, y: WIN.y + WIN.bar, w: WIN.w, h: WIN.h - WIN.bar });

// ---- backdrop + HUD ------------------------------------------------------------------------------------------------
export function desk(g, t, o = {}) {
  g.fillStyle = linGrad(g, 0, 0, E.W, E.H, [C.navy, '#0a1030', '#101a42']); g.fillRect(0, 0, E.W, E.H);
  glow(g, 260 + Math.sin(t * 0.25) * 40, 120, 640, C.violet, 0.34); glow(g, 1700 + Math.cos(t * 0.21) * 40, 980, 640, C.blue, 0.26); if (o.teal) glow(g, 1500, 200, 420, C.teal, 0.12);
  g.save(); g.fillStyle = alpha(C.ink, 0.045); for (let x = 40; x < E.W; x += 64) for (let y = 40; y < E.H; y += 64) g.fillRect(x, y, 2, 2); g.restore();
  for (let i = 0; i < 28; i++) { const x = ((i * 173.3) % E.W + t * (8 + (i % 5) * 3)) % E.W, y = (((i * 97.7) % E.H - t * (6 + (i % 4) * 4)) % E.H + E.H) % E.H; g.fillStyle = alpha(i % 3 ? C.violet : C.teal, 0.16 + 0.1 * Math.sin(t * 0.8 + i)); g.beginPath(); g.arc(x, y, 2 + (i * 13) % 4, 0, 7); g.fill(); }
}
// top strip: brand, ten stage tabs (active highlighted, done = teal), running star counter. active: 0 = none, 1..10 = stage
export function hud(g, t, o = {}) {
  const { active = 0, reveal = active, a = 1 } = o; g.save(); g.globalAlpha *= a;
  const logo = getStill('LOGO'); if (logo) g.drawImage(logo, 34, 16, 56, 56); text(g, 'ideatoapps', 104, 44, { size: 30, font: FONTS.ui, weight: 800, color: C.ink, align: 'left' });
  const x0 = 398, w = 124, gap = 3;
  for (let i = 0; i < 10; i++) { const on = i + 1 === active, done = i + 1 < active, x = x0 + i * (w + gap);
    rr(g, x, 22, w, 44, 12); g.fillStyle = on ? C.violet : done ? alpha(C.teal, 0.22) : alpha(C.ink, 0.07); g.fill(); if (on) { g.strokeStyle = alpha('#fff', 0.7); g.lineWidth = 2; g.stroke(); }
    text(g, String(i + 1).padStart(2, '0'), x + 10, 44, { size: 24, font: FONTS.ui, weight: 800, color: on ? '#fff' : done ? C.teal : C.muted, align: 'left' });
    { g.save(); g.font = `800 15px ${FONTS.ui}`; const lw = g.measureText(TAB_NAMES[i]).width + TAB_NAMES[i].length * 0.3; g.restore();
      const ls = Math.min(15, Math.floor(15 * 70 / Math.max(lw, 1)));   // shrink long labels so they stay inside the tab
      text(g, TAB_NAMES[i], x + 46, 45, { size: ls, font: FONTS.ui, weight: 800, color: on ? '#fff' : done ? C.teal : alpha(C.muted, 0.95), align: 'left', spacing: 0.3 }); } }
  const sum = STARS.slice(0, clamp(Math.round(reveal), 0, 10)).reduce((p, c) => p + c, 0);
  text(g, '★', 1688, 44, { size: 30, color: C.yellow, glow: 10, glowColor: alpha(C.yellow, 0.6) }); text(g, `${Math.round(sum).toLocaleString('en-US')}k`, 1722, 44, { size: 30, font: FONTS.ui, weight: 800, color: C.ink, align: 'left' });
  g.restore();
}

// ---- windows -------------------------------------------------------------------------------------------------------
export const winIn = (t, t0 = 0) => { const k = ease.outBack(prog(t, t0, t0 + 0.45)); return { s: lerp(0.9, 1, k), a: clamp((t - t0) / 0.25) }; };
// draws the chrome and returns the content rect; kind 'browser' types `url` from t0 at cps; 'terminal' shows a title
export function windowFrame(g, t, o = {}) {
  const { kind = 'browser', url = '', t0 = 0, cps = 28, title = 'zsh', tIn = 0 } = o, I = inner(), wi = winIn(t, tIn); if (wi.a <= 0) return null;
  g.save(); g.translate(E.W / 2, WIN.y + WIN.h / 2); g.scale(wi.s, wi.s); g.translate(-E.W / 2, -(WIN.y + WIN.h / 2)); g.globalAlpha *= wi.a;
  g.save(); g.shadowColor = 'rgba(3,6,20,.65)'; g.shadowBlur = 48; g.shadowOffsetY = 18; rr(g, WIN.x, WIN.y, WIN.w, WIN.h, 18); g.fillStyle = kind === 'browser' ? '#1a2250' : '#080d24'; g.fill(); g.restore();
  rr(g, WIN.x, WIN.y, WIN.w, WIN.bar, 18); g.fillStyle = '#18204a'; g.fill(); g.fillRect(WIN.x, WIN.y + 30, WIN.w, 20);
  [['#ff5f57', 0], ['#febc2e', 1], ['#28c840', 2]].forEach(([c, i]) => { g.fillStyle = c; g.beginPath(); g.arc(WIN.x + 30 + i * 26, WIN.y + 25, 7.5, 0, 7); g.fill(); });
  g.font = `600 22px ${MONO}`; g.textBaseline = 'middle'; g.textAlign = 'left';
  if (kind === 'browser') { rr(g, WIN.x + 140, WIN.y + 9, WIN.w - 200, 32, 16); g.fillStyle = '#0d1436'; g.fill(); const n = Math.floor(clamp((t - t0) * cps, 0, url.length)); g.fillStyle = C.ink; g.fillText(url.slice(0, n), WIN.x + 164, WIN.y + 26); if (n < url.length && t >= t0) caret(g, WIN.x + 164 + g.measureText(url.slice(0, n)).width + 2, WIN.y + 26, t, 24, C.violet); }
  else { g.fillStyle = C.muted; g.textAlign = 'center'; g.fillText(title, WIN.x + WIN.w / 2, WIN.y + 26); }
  g.restore(); return { I, wi };
}
export function caret(g, x, y, t, h = 30, col = C.ink) { if (Math.floor(t * 2.4) % 2) return; g.fillStyle = col; g.fillRect(x, y - h / 2, Math.max(3, h * 0.12), h); }
// typed text (monospace) at x,y: returns end x. lines grow at cps; prompt optional
export function typed(g, str, x, y, t, t0, o = {}) {
  const { cps = 24, size = 34, color = C.ink, prompt = '', done = true, idle = false } = o, n = Math.floor(clamp((t - t0) * cps, 0, str.length)); if (t < t0 && !idle) return x;
  g.save(); g.font = `600 ${size}px ${MONO}`; g.textBaseline = 'middle'; g.textAlign = 'left'; let px = x;
  if (prompt) { g.fillStyle = C.teal; g.fillText(prompt, px, y); px += g.measureText(prompt).width; }
  g.fillStyle = color; g.fillText(str.slice(0, n), px, y); const ex = px + g.measureText(str.slice(0, n)).width; if (n < str.length || done) caret(g, ex + 3, y, t, size * 1.15, C.violet); g.restore(); return ex;
}
export const typingEnd = (t0, str, cps = 24) => t0 + str.length / cps;

// ---- real screenshots inside the window, with eased zoom keys -------------------------------------------------------
// keys: [{t, c:[cx,cy] (image fractions), z}] ; returns mapper r=[x,y,w,h](image fractions) -> screen rect
export const fit = (r, pad = 1.7, max = 3.0) => ({ c: [r[0] + r[2] / 2, r[1] + r[3] / 2], z: clamp(1 / Math.max(r[2] * pad, r[3] * pad, 0.05), 1, max) });
function view(keys, t) {
  if (!keys || !keys.length) return { c: [0.5, 0.5], z: 1 }; if (t <= keys[0].t) return keys[0]; let i = 0; while (i < keys.length - 1 && t > keys[i + 1].t) i++;
  const a = keys[i], b = keys[i + 1]; if (!b) return a; const k = ease.inOut(prog(t, a.t, b.t)); return { c: [lerp(a.c[0], b.c[0], k), lerp(a.c[1], b.c[1], k)], z: lerp(a.z, b.z, k) };
}
export function grab(g, id, t, keys, o = {}) {
  const im = getStill(id), I = inner(), v = view(keys, t); if (!im) { g.fillStyle = '#222'; g.fillRect(I.x, I.y, I.w, I.h); return () => [0, 0, 0, 0]; }
  const sw = im.width / v.z, sh = im.height / v.z, sx = clamp(v.c[0] * im.width - sw / 2, 0, im.width - sw), sy = clamp(v.c[1] * im.height - sh / 2, 0, im.height - sh);
  g.save(); g.beginPath(); g.rect(I.x, I.y, I.w, I.h); g.clip(); g.imageSmoothingQuality = 'high'; g.globalAlpha *= o.a ?? 1; g.drawImage(im, sx, sy, sw, sh, I.x, I.y, I.w, I.h); g.restore();
  return r => [I.x + (r[0] * im.width - sx) / sw * I.w, I.y + (r[1] * im.height - sy) / sh * I.h, r[2] * im.width / sw * I.w, r[3] * im.height / sh * I.h];
}

// ---- pointer, highlights, stamps, cards ----------------------------------------------------------------------------
// pts: [{t, x, y}] screen coords (eased), clicks: [t,...]
export function cursor(g, t, pts, clicks = []) {
  if (!pts.length || t < pts[0].t - 0.2) return; let i = 0; while (i < pts.length - 1 && t > pts[i + 1].t) i++;
  const a = pts[i], b = pts[i + 1] || a, k = ease.inOut(prog(t, a.t, b.t)), x = lerp(a.x, b.x, k), y = lerp(a.y, b.y, k);
  const press = clicks.reduce((m, c) => Math.max(m, t >= c && t < c + 0.18 ? 1 : 0), 0);
  for (const c of clicks) { const r = prog(t, c, c + 0.55); if (r > 0 && r < 1) { g.save(); g.strokeStyle = alpha(C.yellow, 0.85 * (1 - r)); g.lineWidth = 4; g.beginPath(); g.arc(x, y, 10 + r * 46, 0, 7); g.stroke(); g.restore(); } }
  g.save(); g.translate(x, y); g.scale(1 - 0.12 * press, 1 - 0.12 * press); g.shadowColor = 'rgba(0,0,0,.5)'; g.shadowBlur = 10; g.shadowOffsetY = 4;
  g.beginPath(); g.moveTo(0, 0); g.lineTo(0, 30); g.lineTo(8, 23); g.lineTo(14, 36); g.lineTo(20, 33); g.lineTo(14, 21); g.lineTo(24, 21); g.closePath(); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#0b1230'; g.stroke(); g.restore();
}
// animated highlight box around a screen rect; label optional
export function hilite(g, r, t, t0, o = {}) {
  const k = ease.out(prog(t, t0, t0 + 0.45)); if (k <= 0 || !r) return; const { color = C.yellow, pad = 10, label = '' } = o, p = Math.sin(t * 5) * 2;
  g.save(); g.globalAlpha *= o.a ?? 1; glow(g, r[0] + r[2] / 2, r[1] + r[3] / 2, Math.max(r[2], r[3]) * 0.9 * k, color, 0.18);
  g.strokeStyle = color; g.lineWidth = 5; g.lineJoin = 'round'; rr(g, r[0] - pad - p, r[1] - pad - p, (r[2] + pad * 2 + p * 2) * k, r[3] + pad * 2 + p * 2, 12); g.stroke();
  if (label && k > 0.6) { const w = measure(g, label, 28, FONTS.ui, 800) + 36; rr(g, r[0] - pad, r[1] - pad - 54, w, 44, 22); g.fillStyle = color; g.fill(); text(g, label, r[0] - pad + 18, r[1] - pad - 32, { size: 28, font: FONTS.ui, weight: 800, color: '#0b1230', align: 'left' }); }
  g.restore();
}
// slammed stamp (THE CATCH, CATCH #1 ...)
export function stamp(g, label, x, y, t, t0, o = {}) {
  const k = prog(t, t0, t0 + 0.22); if (k <= 0) return; const { color = C.amber, size = 64, rot = -0.07 } = o, s = lerp(2.2, 1, ease.out(k)), w = measure(g, label, size, FONTS.title, 800) + 70, h = size + 44;
  const sh = k < 1 ? 0 : Math.exp(-(t - t0 - 0.22) * 9) * 7;
  g.save(); g.translate(x + Math.sin(t * 90) * sh, y + Math.cos(t * 77) * sh); g.rotate(rot); g.scale(s, s); g.globalAlpha *= clamp(k * 2);
  rr(g, -w / 2, -h / 2, w, h, 14); g.fillStyle = alpha('#0b1230', 0.78); g.fill(); g.strokeStyle = color; g.lineWidth = 7; g.stroke(); rr(g, -w / 2 + 9, -h / 2 + 9, w - 18, h - 18, 9); g.lineWidth = 2; g.stroke();
  text(g, label, 0, 3, { size, weight: 800, color, spacing: 5, glow: 14, glowColor: alpha(color, 0.55) }); g.restore();
}
// side card (left or right margin of the window): title + 1-3 lines
export function sideCard(g, side, title, lines, t, t0, o = {}) {
  const k = ease.outBack(prog(t, t0, t0 + 0.5)); if (k <= 0) return; const w = 300, x = side === 'l' ? 28 : E.W - w - 28, y = o.y ?? 300, h = 70 + lines.length * 52, col = o.color || C.violet;
  g.save(); g.globalAlpha *= clamp(k * 1.5); g.translate(lerp(side === 'l' ? -60 : 60, 0, k), 0); rr(g, x, y, w, h, 18); g.fillStyle = alpha(C.navy2, 0.95); g.fill(); g.strokeStyle = alpha(col, 0.8); g.lineWidth = 3; g.stroke();
  text(g, title, x + 22, y + 34, { size: 26, font: FONTS.ui, weight: 800, color: col === C.violet ? C.link : col, align: 'left', spacing: 1.5 });
  lines.forEach((l, i) => text(g, l, x + 22, y + 82 + i * 48, { size: o.size || 32, font: FONTS.ui, weight: 800, color: C.ink, align: 'left' })); g.restore();
}
// big count-up number with a unit (e.g. 135.8k stars)
export function bigNumber(g, v, unit, x, y, t, t0, t1, o = {}) {
  const k = ease.out(prog(t, t0, t1)), n = (v * k).toFixed(o.dec ?? 1); text(g, `${n}${o.suffix ?? 'k'}`, x, y, { size: o.size || 120, weight: 800, color: o.color || C.yellow, glow: 22, glowColor: alpha(o.color || C.yellow, 0.5), align: o.align || 'center' });
  text(g, unit, x, y + (o.size || 120) * 0.62, { size: 34, font: FONTS.ui, weight: 800, color: C.muted, align: o.align || 'center', spacing: 3 });
}
export const bump = (t, t0, amp = 8, len = 0.5) => { const k = (t - t0) / len; if (k < 0 || k > 1) return [0, 0]; const a = amp * (1 - k) * (1 - k); return [Math.sin(t * 88) * a, Math.cos(t * 73) * a * 0.8]; };
