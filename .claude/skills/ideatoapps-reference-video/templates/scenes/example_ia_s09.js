// S09 scoreboard: animated bar chart of all 24 REAL runs (zero baseline, seconds), min/max ranges, caveats
import { E, ease, clamp, lerp, prog, alpha, rr } from '/engine/core.js';
import * as K from '../kit.js';
import * as U from '../sets/fc_ui.js';
const text = U.text;
import { BENCH } from '../sets/fc_data2.js';
import { EARLIER } from '../sets/fc_data.js';
const COL = { A: K.C.violet, B: K.C.teal, C: K.C.blue };
U.shot('ia_s09', 'THE SCOREBOARD', (g, t, info) => {
  const s0 = info.shot.start, a = id => U.L(id) - s0, e = id => U.LE(id) - s0; K.desk(g, t);
  if (t < a('s09_3') - 0.1) {
    const x0 = 200, y0 = 760, W = 1520, H = 430, max = 40, order = ['A', 'B', 'C'].flatMap(S => BENCH.filter(r => r.setup === S));
    g.save(); g.strokeStyle = alpha(K.C.ink, 0.35); g.lineWidth = 3; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + W, y0); g.moveTo(x0, y0); g.lineTo(x0, y0 - H - 20); g.stroke();
    [0, 10, 20, 30, 40].forEach(v => { const y = y0 - H * v / max; text(g, String(v), x0 - 16, y, { size: 26, font: U.UI, weight: 800, color: K.C.muted, align: 'right' }); g.strokeStyle = alpha(K.C.ink, 0.1); g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + W, y); g.stroke(); }); g.restore();
    text(g, 'seconds', x0 - 20, y0 - H - 50, { size: 28, font: U.UI, weight: 800, color: K.C.muted, align: 'left' });
    order.forEach((r, i) => { const k = ease.out(prog(t, a('s09_1') + 0.4 + i * 0.12, a('s09_1') + 1.2 + i * 0.12)), bw = 46, x = x0 + 30 + i * (W - 40) / 24, h = H * r.secs / max * k; rr(g, x, y0 - h, bw, Math.max(h, 2), 6); g.fillStyle = alpha(COL[r.setup], r.task === 'bug' ? 0.95 : 0.6); g.fill(); });
    ['A direct', 'B router', 'C OpenCode'].forEach((s, i) => { const x = x0 + 30 + (i * 8 + 3.5) * (W - 40) / 24; text(g, s, x, y0 + 40, { size: 30, font: U.UI, weight: 800, color: COL['ABC'[i]] }); });
    const k = U.appear(t, a('s09_1') + 3.0); if (k > 0 && t < a('s09_2')) { g.save(); g.globalAlpha *= clamp(k); text(g, '24 / 24 PASSED · $0 of $5', 960, 215, { size: 70, weight: 800, color: K.C.teal }); g.restore(); } U.tag(g, 'my own runs, 2026-11-26 · faint = simple task, solid = bug-fix task · 5+3 runs per setup', 960, 850, { size: 22 });
    if (t > a('s09_2')) { const rg = S => { const v = BENCH.filter(r => r.setup === S).map(r => r.secs); return [Math.min(...v), Math.max(...v)]; }; g.save(); g.globalAlpha *= clamp(ease.out(prog(t, a('s09_2'), a('s09_2') + 0.6))); rr(g, 150, 150, 1620, 150, 20); U.reg(150, 150, 1620, 150); g.fillStyle = alpha(K.C.navy, 0.96); g.fill(); ['A', 'B', 'C'].forEach((S, i) => { const [lo, hi] = rg(S); text(g, `${'ABC'[i]}: ${lo.toFixed(0)}–${hi.toFixed(0)} s`, 360 + i * 600, 225, { size: 54, weight: 800, color: COL[S] }); }); g.restore(); }
  } else if (t < a('s09_5') - 0.1) {                                                                // 09.3-09.4 fine print
    U.panel(g, 280, 200, 1360, 560, K.C.amber); U.kin(g, 'READ THE FINE PRINT', 960, 290, t, a('s09_3') + 0.1, { size: 64, color: K.C.amber, spacing: 3 });
    [['2 small tasks', a('s09_3') + 0.6], ['1 small program', a('s09_3') + 1.8], ['1 machine', a('s09_3') + 3.0], ['not a benchmark of real projects', a('s09_3') + 4.2], ['big codebases, long sessions: not tested', a('s09_4') + 0.4]].forEach(([s, ts], i) => { const k = U.appear(t, ts); g.save(); g.globalAlpha *= clamp(k); text(g, '• ' + s, 960, 390 + i * 70, { size: 44, font: U.UI, weight: 800, color: i >= 3 ? K.C.yellow : K.C.ink }); g.restore(); });
  } else {                                                                                          // 09.5 open loop: the router log returns
    U.panel(g, 330, 220, 1260, 500, K.C.violet); text(g, 'PASSING IS NOT THE WHOLE STORY', 960, 300, { size: 52, weight: 800, color: K.C.yellow }); EARLIER.slice(0, 4).forEach((r, i) => { const k = U.appear(t, a('s09_5') + 0.6 + i * 0.4); g.save(); g.globalAlpha *= clamp(k) * 0.9; text(g, `${r[0]}   ${r[1]}   ${r[2] === 'error' ? 'HTTP 429' : 'ok'}`, 960, 400 + i * 64, { size: 34, font: U.UI, weight: 700, color: r[2] === 'error' ? K.C.red : K.C.ink }); g.restore(); });
    text(g, 'remember the router log?', 960, 700, { size: 40, font: U.HAND, weight: 400, color: K.C.muted });
  }
});
