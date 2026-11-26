// S10 turn one switch: guess card, REAL API toggle output, REAL router rows (only openrouter), REAL session outcomes + error text, see-saw
import { E, ease, clamp, lerp, prog, alpha, rr } from '/engine/core.js';
import * as K from '../kit.js';
import * as U from '../sets/fc_ui.js';
const text = U.text;
import { KROWS, ERR, KEYLESS } from '../sets/fc_data2.js';
import { KRUN } from '../sets/fc_data3.js';
U.shot('ia_s10', 'THE SWITCH', (g, t, info) => {
  const s0 = info.shot.start, a = id => U.L(id) - s0, e = id => U.LE(id) - s0; K.desk(g, t);
  if (t < a('s10_2') - 0.1 + 1.2) {                                                                 // 10.1 guess card (answered at the start of 10.2)
    const q = U.appear(t, 0.2); U.panel(g, 260, 190, 1400, 560, K.C.violet, clamp(q)); if (q > 0) g.globalAlpha = clamp(q); text(g, 'Switch off the keyless providers. Better, worse, or both?', 960, 280, { size: 48, font: U.UI, weight: 800, color: K.C.ink });
    const t2 = a('s10_2'); [['BETTER', 350], ['WORSE', 770], ['BOTH', 1190]].forEach(([s, x], i) => { const on = t >= t2 && i === 2; rr(g, x, 380, 380, 260, 22); U.reg(x, 380, 380, 260); g.fillStyle = on ? alpha(K.C.violet, 0.95) : alpha(K.C.navy3, 0.9); g.fill(); g.strokeStyle = on ? '#fff' : alpha(K.C.violet, 0.6); g.lineWidth = on ? 6 : 3; g.stroke(); text(g, s, x + 190, 510, { size: 62, weight: 800, color: on ? K.C.yellow : K.C.ink, spacing: 3 }); }); g.globalAlpha = 1;
  } else if (t < a('s10_3') - 0.1) {                                                                // 10.2 real toggle output
    const lines = [['$ for id in 1 2 3 4; do curl -X PATCH …/api/keys/$id -d \'{"enabled":false}\'; done', '#5ad67a'], ['{"success":true,"enabled":false}', K.C.ink], ['{"success":true,"enabled":false}', K.C.ink], ['{"success":true,"enabled":false}', K.C.ink], ['{"success":true,"enabled":false}', K.C.ink], ['', K.C.ink], ['openrouter  on      (my own key)', K.C.teal], ['aihorde     OFF', K.C.red], ['kilo        OFF', K.C.red], ['ovh         OFF', K.C.red], ['parallel    OFF', K.C.red]];
    const n = Math.min(lines.length, 1 + Math.floor(Math.max(0, t - a('s10_2') - 0.6) / 0.55)); U.lines(g, t, lines.slice(0, n), { title: 'real calls to the router’s own API', tIn: a('s10_2') - 0.2, size: 28 });
  } else if (t < a('s10_4') - 0.1) {                                                                // 10.3 real DB rows, only openrouter
    const rows = KROWS.slice(-12); U.panel(g, 230, 170, 1460, 640, K.C.teal); text(g, 'THE LOG NOW: ONE PROVIDER', 960, 225, { size: 46, font: U.UI, weight: 800, color: K.C.ink });
    const cx = [270, 480, 1050, 1260, 1450]; ['PROVIDER', 'MODEL', 'STATUS', 'IN-TOKENS'].forEach((s, i) => text(g, s, cx[i], 290, { size: 24, font: U.UI, weight: 800, color: K.C.muted, align: 'left', spacing: 2 }));
    rows.forEach((r, i) => { const k = U.appear(t, a('s10_3') + 0.4 + i * 0.22, 0.3); if (k <= 0) return; g.save(); g.globalAlpha *= clamp(k); const y = 335 + i * 36, bad = r[3] === 'error'; [r[1], r[2], bad ? 'HTTP 429' : 'ok', String(r[4])].forEach((s, j) => text(g, s, cx[j], y, { size: 24, font: U.UI, weight: 700, color: bad ? K.C.red : j === 0 ? K.C.teal : K.C.ink, align: 'left' })); g.restore(); });
    U.tag(g, 'real rows from the router database after the switch, 2026-11-26', 960, 100, { size: 22 });
  } else if (t < a('s10_6') - 0.1) {                                                                // 10.4-10.5 three sessions
    const runs = [['run 1', 15.7, 'session OK', K.C.teal], ['run 2', 26.1, 'session error: ran out of turns', K.C.amber], ['run 3', 7.8, 'session error: API 429 daily limit', K.C.red]]; text(g, 'SAME TASK, THREE RUNS', 960, 190, { size: 50, weight: 800, color: K.C.yellow, spacing: 3 });
    runs.forEach(([n, s, msg, col], i) => { const k = U.appear(t, a('s10_4') + 1.2 + i * 1.3); if (k <= 0) return; g.save(); g.globalAlpha *= clamp(k); g.translate((1 - clamp(k)) * 300, 0); U.panel(g, 250, 260 + i * 190, 1420, 150, col); text(g, n, 340, 335 + i * 190, { size: 40, font: U.UI, weight: 800, color: K.C.ink, align: 'left' }); text(g, s + ' s', 560, 335 + i * 190, { size: 40, font: U.UI, weight: 700, color: K.C.muted, align: 'left' }); text(g, msg, 1650, 335 + i * 190, { size: 38, font: U.UI, weight: 800, color: col, align: 'right' }); g.restore(); });
    U.tag(g, 'all three still produced a working todo.py by my check; two sessions ended in an error', 960, 100, { size: 22 });
  } else if (t < a('s10_7') - 0.1) {                                                                // 10.6 the real error text
    const m = ERR.replace(/: \[redacted-url\]/, '').replace('OpenRouter API error 429: ', ''); const f = U.lines(g, t, [['OpenRouter API error 429:', K.C.red], [m, K.C.ink]], { title: 'real error from the router log', tIn: a('s10_6') - 0.3, size: 30 });
    const r = f('Rate limit exceeded: free-models-per-day'); if (r) K.hilite(g, r, t, a('s10_6') + 1.2, { color: K.C.red, label: 'free models per day' });
  } else if (t < a('s10_8') - 0.1) {                                                                // 10.7 real router message
    const full = (KRUN[103].res || '').replace(/\s+/g, ' '); const msg = full.slice(0, full.indexOf('Attempt trail') > 0 ? full.indexOf('Attempt trail') : 150).trim(); const f = U.lines(g, t, [['session result (run 3):', K.C.muted, true], [msg, K.C.ink]], { title: 'real result of the third session', tIn: a('s10_7') - 0.3, size: 30 });
    const r = f('Soonest cooldown reset ~20h'); if (r) K.hilite(g, r, t, a('s10_7') + 2.0, { color: K.C.amber, label: 'about 20 hours' });
  } else {                                                                                          // 10.8 see-saw
    const tilt = Math.sin(clamp((t - a('s10_8')) / 3) * Math.PI * 2) * 0.12; g.save(); g.translate(960, 600); g.rotate(tilt); g.fillStyle = K.C.ink; rr(g, -520, -10, 1040, 20, 10); g.fill(); g.restore(); g.fillStyle = K.C.violet; g.beginPath(); g.moveTo(960, 600); g.lineTo(920, 700); g.lineTo(1000, 700); g.closePath(); g.fill();
    [['KEYLESS', 'more models', 'less private', K.C.amber, 520], ['YOUR KEY ONLY', 'more private', 'quickly rate limited', K.C.teal, 1400]].forEach(([h, a1, a2, col, x], i) => { const k = U.appear(t, a('s10_8') + 0.5 + i * 1.2); g.save(); g.globalAlpha *= clamp(k); g.translate(0, Math.sin(tilt) * (i ? 1 : -1) * 220); U.panel(g, x - 260, 250, 520, 290, col); text(g, h, x, 310, { size: 44, weight: 800, color: col, spacing: 2 }); text(g, a1, x, 400, { size: 40, font: U.UI, weight: 800, color: K.C.ink }); text(g, a2, x, 470, { size: 40, font: U.UI, weight: 800, color: K.C.yellow }); g.restore(); });
  }
});
