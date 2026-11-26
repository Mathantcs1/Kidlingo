// Shared helpers for the "Free Claude Code" screencast. Terminal windows REPLAY real captured sessions (fc_term.js); nothing is typed by hand.
import { E, registerShot, ease, clamp, lerp, prog, alpha, rr, text as coreText, measure, FONTS } from '/engine/core.js';
import * as K from '../kit.js';
import { TERM } from './fc_term.js';
import { LT, SC } from './fc_times.js';
const PANELS = []; export const reg = (x, y, w, h) => { PANELS.push([x, y, w, h]); };
export function text(g, s, x, y, o = {}) {                                  // auto-fit: text never leaves the box it is drawn in
  let size = o.size || 32; const al = o.align || 'center', P = PANELS.filter(p => x >= p[0] - 2 && x <= p[0] + p[2] + 2 && y >= p[1] && y <= p[1] + p[3]).sort((m, n) => m[2] * m[3] - n[2] * n[3])[0];
  if (P) { const pad = 28, maxW = al === 'left' ? P[0] + P[2] - pad - x : al === 'right' ? x - P[0] - pad : 2 * Math.min(x - P[0], P[0] + P[2] - x) - pad * 2, w = measure(g, String(s), size, o.font || FONTS.title, o.weight || 800) + (o.spacing || 0) * String(s).length; if (w > maxW && maxW > 80) size = Math.max(16, Math.floor(size * maxW / w)); }
  return coreText(g, s, x, y, { ...o, size });
}
export const C = K.C, MONO = K.MONO, HAND = 'Kalam', UI = 'Nunito', BIG = 'Fredoka';
export const L = id => LT[id][0], LE = id => LT[id][1];
// piecewise-linear map local time -> replay time. anchors: [[localT, replayT], ...]
export function pw(t, an) { if (t <= an[0][0]) return an[0][1]; for (let i = 1; i < an.length; i++) if (t <= an[i][0]) return lerp(an[i - 1][1], an[i][1], (t - an[i - 1][0]) / Math.max(an[i][0] - an[i - 1][0], 1e-6)); return an[an.length - 1][1]; }

const COL = { 32: '#5ad67a', 33: C.yellow, 35: '#c9a6ff', 36: '#5fd7e6', 31: C.red };
function chars(ev, i0, i1, tt) {                                    // ANSI stream -> [{ch,c,d,b}] (newline = '\n')
  const out = []; let cur = { c: C.ink, d: false, b: false };
  for (let i = i0; i <= i1; i++) { const [te, s] = ev[i]; if (te > tt) break;
    const typing = s.startsWith('\x1b[32m$'), mark = out.length, re = /\x1b\[([0-9;]*)m|\r|\n|[^\x1b\r\n]+|\x1b./g; let m;
    while ((m = re.exec(s))) { const x = m[0];
      if (m[1] !== undefined) { for (const p of (m[1] || '0').split(';')) { const n = +p; if (n === 0) cur = { c: C.ink, d: false, b: false }; else if (n === 1) cur = { ...cur, b: true }; else if (n === 2) cur = { ...cur, d: true }; else if (COL[n]) cur = { ...cur, c: COL[n] }; } }
      else if (x === '\n') out.push({ ch: '\n' }); else if (x[0] === '\x1b' || x === '\r') continue; else for (const ch of x) out.push({ ch, ...cur }); }
    if (typing) { const n = Math.floor(Math.max(0, tt - te) * 44), vis = out.slice(mark).filter(c => c.ch !== '\n').length; if (n < vis) { let k = 0; out.length = mark + out.slice(mark).findIndex(c => c.ch !== '\n' && ++k > n); } } }
  return out;
}
// draw wrapped text rows inside the window content rect; returns find(substr, nth) -> screen rect
export function rows(g, list, I, size = 26) {
  g.save(); g.font = `600 ${size}px ${MONO}`; const cw = g.measureText('M').width, lh = Math.round(size * 1.3), cols = Math.floor((I.w - 56) / cw), maxR = Math.floor((I.h - 40) / lh);
  const R = [[]]; for (const c of list) { if (c.ch === '\n') R.push([]); else { if (R[R.length - 1].length >= cols) R.push([]); R[R.length - 1].push(c); } }
  const vis = R.slice(-maxR), plain = []; g.beginPath(); g.rect(I.x, I.y, I.w, I.h); g.clip(); g.textBaseline = 'middle'; g.textAlign = 'left';
  vis.forEach((r, i) => { const y = I.y + 30 + i * lh; plain.push({ s: r.map(c => c.ch).join(''), y }); r.forEach((c, j) => { g.globalAlpha = c.d ? 0.6 : 1; g.fillStyle = c.c; g.font = `${c.b ? 800 : 600} ${size}px ${MONO}`; g.fillText(c.ch, I.x + 28 + j * cw, y); }); });
  g.restore();
  return (sub, nth = 0) => { let k = 0; for (const p of plain) { const ix = p.s.indexOf(sub); if (ix >= 0) { if (k++ === nth) return [I.x + 28 + ix * cw, p.y - lh / 2, sub.length * cw, lh]; } } return null; };
}
// terminal window replaying TERM[key] events i0..i1; an = anchors local time -> replay time
export function term(g, t, key, i0, i1, an, o = {}) {
  const f = K.windowFrame(g, t, { kind: 'terminal', title: o.title || 'zsh', tIn: o.tIn ?? 0 }); if (!f) return () => null;
  return rows(g, chars(TERM[key], i0, i1, pw(t, an)), f.I, o.size || 26);
}
// static terminal from plain lines (real data); lines: [[text,color?]]
export function lines(g, t, ls, o = {}) {
  const f = K.windowFrame(g, t, { kind: 'terminal', title: o.title || 'zsh', tIn: o.tIn ?? 0 }); if (!f) return () => null;
  const list = []; ls.forEach(([s, c, d], i) => { for (const ch of s) list.push({ ch, c: c || C.ink, d: !!d, b: false }); list.push({ ch: '\n' }); });
  return rows(g, list, f.I, o.size || 26);
}
export function panel(g, x, y, w, h, col = C.violet, a = 1) { reg(x, y, w, h); g.save(); g.globalAlpha *= a; g.shadowColor = 'rgba(3,6,20,.55)'; g.shadowBlur = 34; g.shadowOffsetY = 14; rr(g, x, y, w, h, 20); const gr = g.createLinearGradient(0, y, 0, y + h); gr.addColorStop(0, alpha(C.navy3, 0.97)); gr.addColorStop(1, alpha(C.navy2, 0.97)); g.fillStyle = gr; g.fill(); g.shadowColor = 'transparent'; g.strokeStyle = alpha(col, 0.85); g.lineWidth = 4; g.stroke(); g.fillStyle = alpha(col, 0.9); rr(g, x + 26, y - 2, Math.min(150, w * 0.18), 6, 3); g.fill(); g.restore(); }
export function brand(g, t, label) { return;
  const logo = K.RECTS && null; g.save(); text(g, 'ideatoapps', 104, 44, { size: 30, font: FONTS.ui, weight: 800, color: C.ink, align: 'left' });
  text(g, label, E.W - 40, 44, { size: 26, font: FONTS.ui, weight: 800, color: C.muted, align: 'right', spacing: 2 }); g.restore();
}
export const tag = (g, s, x, y, o = {}) => text(g, s, x, y, { size: (o.size || 26) + 4, font: HAND, weight: 400, color: o.color || C.muted, align: o.align || 'center' });
export const appear = (t, t0, d = 0.45) => ease.outBack(prog(t, t0, t0 + d));

export const TOTAL = SC[SC.length - 1], SCENES = SC;
export function progress(g, t, info) {
  const T = info.shot.start + t, y = 1066; g.save(); g.fillStyle = alpha(C.ink, 0.1); g.fillRect(0, y, E.W, 8);
  g.fillStyle = C.violet; g.fillRect(0, y, E.W * clamp(T / TOTAL), 8); g.fillStyle = C.yellow; g.fillRect(E.W * clamp(T / TOTAL) - 3, y - 2, 6, 12);
  SCENES.slice(1, -1).forEach(s => { g.fillStyle = alpha('#fff', 0.55); g.fillRect(E.W * s / TOTAL - 1.5, y, 3, 8); }); g.restore();
}
export function banner(g, t, label, n) {                                  // chapter banner: slides in, underline grows
  const k = ease.out(prog(t, 0.15, 0.7)); g.save(); g.globalAlpha *= clamp(k); g.translate(0, (1 - k) * -26);
  text(g, label, E.W - 40, 46, { size: 34, font: HAND, weight: 700, color: C.ink, align: 'right', spacing: 1 });
  g.strokeStyle = C.violet; g.lineWidth = 5; g.lineCap = 'round'; const w = measure(g, label, 34, HAND, 700) * ease.out(prog(t, 0.35, 1.0)); g.beginPath(); g.moveTo(E.W - 40 - w, 70); g.lineTo(E.W - 40, 70); g.stroke(); g.restore();
}
const WIPES = 4;
function beatFx(g, k, idx) {                                           // quick accent transition at each new beat (k = seconds since beat start)
  const d = 0.5, u = k / d; if (u < 0 || u > 1) return; const ty = idx % WIPES; g.save();
  if (ty === 0) { const x = lerp(-700, E.W + 300, ease.inOut(u)); g.globalAlpha = 0.85 * Math.sin(u * Math.PI); const gr = g.createLinearGradient(x - 300, 0, x + 300, 0); gr.addColorStop(0, 'rgba(115,87,245,0)'); gr.addColorStop(0.5, alpha(C.violet, 0.95)); gr.addColorStop(1, 'rgba(54,124,245,0)'); g.fillStyle = gr; g.beginPath(); g.moveTo(x - 300, 0); g.lineTo(x + 420, 0); g.lineTo(x + 300, E.H); g.lineTo(x - 420, E.H); g.closePath(); g.fill(); }
  else if (ty === 1) { for (let i = 0; i < 6; i++) { const ph = clamp(u * 1.4 - i * 0.08), w = E.W * Math.sin(ph * Math.PI); g.globalAlpha = 0.8; g.fillStyle = i % 2 ? C.violet : C.blue; g.fillRect(i % 2 ? E.W - w : 0, i * E.H / 6, w, E.H / 6 + 1); } }
  else if (ty === 2) { g.globalAlpha = 0.7 * (1 - u); g.strokeStyle = C.yellow; g.lineWidth = 10 * (1 - u) + 2; g.beginPath(); g.arc(E.W / 2, E.H / 2, 80 + u * 1100, 0, 7); g.stroke(); g.globalAlpha = 0.18 * (1 - u); g.fillStyle = '#fff'; g.fillRect(0, 0, E.W, E.H); }
  else { const w = lerp(0, E.W, ease.inOut(u)); g.globalAlpha = 0.8 * Math.sin(u * Math.PI); const gr = g.createLinearGradient(0, 0, w, 0); gr.addColorStop(0, alpha(C.amber, 0.0)); gr.addColorStop(1, alpha(C.amber, 0.9)); g.fillStyle = gr; g.fillRect(0, E.H - 16 - 0, w, 16); g.fillRect(0, 0, w, 10); }
  g.restore();
}
export function kin(g, s, x, y, t, t0, o = {}) {                         // kinetic headline: letters rise in one by one
  const size = o.size || 70; g.save(); g.font = `${o.weight || 800} ${size}px ${o.font || BIG}`; g.textBaseline = 'middle'; g.textAlign = 'left'; const sp = o.spacing || 0, w = g.measureText(s).width + sp * s.length; let cx = x - w / 2;
  [...s].forEach((ch, i) => { const k = ease.outBack(prog(t, t0 + i * 0.035, t0 + i * 0.035 + 0.4)), cw = g.measureText(ch).width + sp; if (k > 0) { g.save(); g.globalAlpha *= clamp(k); g.shadowColor = alpha(o.color || C.yellow, 0.5); g.shadowBlur = o.glow ?? 18; g.fillStyle = o.color || C.yellow; g.fillText(ch, cx, y + (1 - clamp(k)) * 46); g.restore(); } cx += cw; }); g.restore(); }
export function shot(id, label, fn) {
  const n = +id.slice(-2), pre = 's' + String(n).padStart(2, '0') + '_', ids = Object.keys(LT).filter(k => k.startsWith(pre)).sort();
  registerShot(id, { draw(g, t, info) {
    PANELS.length = 0; const s0 = info.shot.start, dur = info.shot.end - s0, starts = ids.map(k => LT[k][0] - s0); let bi = -1; starts.forEach((v, i) => { if (t >= v - 0.02) bi = i; });
    const bk = bi > 0 ? t - starts[bi] : 9, pop = bi > 0 ? (1 - ease.out(clamp(bk / 0.5))) * 0.04 : 0, z = 1 + 0.028 * ease.inOut(clamp(t / Math.max(dur, 1))) + pop, fx = Math.sin(t * 0.3) * 6;
    g.save(); g.translate(E.W / 2 + fx, E.H / 2 - 10 * clamp(t / dur)); g.scale(z, z); g.translate(-E.W / 2, -E.H / 2); fn(g, t, info); g.restore();
    if (bi > 0) beatFx(g, bk, bi);
    if (n > 1) { const a0 = 0.2, hold = 2.4, k1 = ease.out(prog(t, a0, a0 + 0.5)), k2 = ease.inOut(prog(t, a0 + hold, a0 + hold + 0.45)); if (k1 > 0 && k2 < 1) { g.save(); g.translate(lerp(-640, 40, k1) - k2 * 700, 0); rr(g, 0, 962, 600, 84, 16); g.fillStyle = alpha(C.navy, 0.92); g.fill(); g.strokeStyle = alpha(C.violet, 0.9); g.lineWidth = 3; g.stroke(); g.fillStyle = C.violet; g.fillRect(0, 962, 10, 84);
        coreText(g, 'CHAPTER ' + String(n).padStart(2, '0'), 34, 988, { size: 22, font: UI, weight: 800, color: C.yellow, align: 'left', spacing: 3 }); coreText(g, label, 34, 1022, { size: 28, font: HAND, weight: 700, color: C.ink, align: 'left' }); g.restore(); } }
    const vg = g.createRadialGradient(E.W / 2, E.H / 2, E.H * 0.55, E.W / 2, E.H / 2, E.H * 1.05); vg.addColorStop(0, 'rgba(5,8,26,0)'); vg.addColorStop(1, 'rgba(5,8,26,0.42)'); g.fillStyle = vg; g.fillRect(0, 0, E.W, E.H);
    coreText(g, 'ideatoapps', 104, 44, { size: 32, font: HAND, weight: 700, color: C.ink, align: 'left' }); banner(g, t, label); progress(g, t, info);
  } });
}
export function count(g, v, t, t0, t1, x, y, o = {}) { const k = ease.out(prog(t, t0, t1)); text(g, `${o.pre || ''}${((o.dec ?? 1) === 0 ? Math.round(v * k).toLocaleString('en-US') : (v * k).toFixed(o.dec ?? 1))}${o.suf || ''}`, x, y, { size: o.size || 200, font: BIG, weight: 800, color: o.color || C.yellow, glow: 24, glowColor: alpha(o.color || C.yellow, 0.5) }); }

export function glide(g, t, rc, t0, t1) { if (!rc) return; const I = K.inner(); K.cursor(g, t, [{ t: t0, x: I.x + I.w * 0.86, y: I.y + I.h * 0.86 }, { t: t1, x: rc[0] + Math.min(rc[2] * 0.5, 280), y: rc[1] + rc[3] / 2 }], [t1 + 0.15]); }

// ---- animation helpers (v4) ----
export function chip(g, s, x, y, col, a = 1, size = 32) { g.save(); g.globalAlpha *= clamp(a); const w = measure(g, s, size, UI, 800) + 44; rr(g, x - w / 2, y - 30, w, 60, 30); g.fillStyle = alpha(col, 0.22); g.fill(); g.strokeStyle = col; g.lineWidth = 3; g.stroke(); text(g, s, x, y + 1, { size, font: UI, weight: 800, color: C.ink }); g.restore(); return w; }
export function flow(g, t, t0, x0, x1, y, n, col, spd = 0.5) {     // packets sliding left->right (illustrative motion)
  for (let i = 0; i < n; i++) { const ph = (t - t0) * spd - i / n, k = ph - Math.floor(ph), x = lerp(x0, x1, k); g.save(); g.globalAlpha *= clamp(Math.sin(k * Math.PI) * 1.6) * clamp((t - t0) * 2); g.fillStyle = col; rr(g, x - 15, y - 10, 30, 20, 7); g.fill(); g.restore(); } }
export function ticks(g, t, t0, oks, x, y, cols, gap = 78, step = 0.13) {        // grid of check ticks that pop in one by one
  oks.forEach((ok, i) => { const k = ease.outBack(prog(t, t0 + i * step, t0 + i * step + 0.3)); if (k <= 0) return; const cx = x + (i % cols) * gap, cy = y + Math.floor(i / cols) * gap; g.save(); g.translate(cx, cy); g.scale(k, k);
    rr(g, -30, -30, 60, 60, 14); g.fillStyle = alpha(ok ? C.teal : C.red, 0.25); g.fill(); g.strokeStyle = ok ? C.teal : C.red; g.lineWidth = 4; g.stroke(); g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); if (ok) { g.moveTo(-14, 2); g.lineTo(-4, 13); g.lineTo(15, -12); } else { g.moveTo(-12, -12); g.lineTo(12, 12); g.moveTo(12, -12); g.lineTo(-12, 12); } g.stroke(); g.restore(); }); }
// horizontal timer bars: rows [{label, v (seconds), col}], zero baseline, unit label. bars grow from t0 to t1
export function bars(g, t, t0, t1, rowsIn, x, y, w, o = {}) {
  const max = o.max || Math.max(...rowsIn.map(r => r.v)) * 1.1, h = o.h || 44, gap = o.gap || 62; g.save(); g.strokeStyle = alpha(C.ink, 0.35); g.lineWidth = 3; g.beginPath(); g.moveTo(x, y - 20); g.lineTo(x, y + rowsIn.length * gap - 10); g.stroke();
  rowsIn.forEach((r, i) => { const k = ease.out(prog(t, t0 + i * 0.25, t1 + i * 0.25)), bw = w * (r.v / max) * k; rr(g, x + 3, y + i * gap, Math.max(bw, 2), h, 10); g.fillStyle = alpha(r.col || C.violet, 0.9); g.fill();
    text(g, r.label, x - 16, y + i * gap + h / 2, { size: 28, font: UI, weight: 800, color: C.muted, align: 'right' }); if (k > 0.8) text(g, r.v.toFixed(1) + ' s', x + 3 + bw + 14, y + i * gap + h / 2, { size: 30, font: UI, weight: 800, color: C.ink, align: 'left' }); }); g.restore(); }
export const sec = (v, t, t0, dur) => clamp((t - t0) / dur) * v;
