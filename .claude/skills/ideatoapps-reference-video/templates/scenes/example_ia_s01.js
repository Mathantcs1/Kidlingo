// S01 cold open: real titles -> 10.1B -> three runs -> 24/24 -> the switch teaser -> plan -> README -> poll
import { E, ease, clamp, lerp, prog, alpha, rr } from '/engine/core.js';
import * as K from '../kit.js';
import * as U from '../sets/fc_ui.js';
const text = U.text;
import { FC } from '../sets/fc_rects.js';
import { BENCH } from '../sets/fc_data2.js';
const TITLES = ['I Tested 9 Ways to Use Claude Code for Free', 'How to Use Claude Code for FREE? (10.1 Billion Tokens)', 'Claude Code for FREE: No Subscription, No Card', 'Claude Code for Free With 10 Billion Tokens a Month', 'Claude Code Free Setup: Use Claude Code 100% FREE!', 'Claude Code is Now 100% FREE Forever'];
U.shot('ia_s01', 'FREE CLAUDE CODE · REAL TESTS', (g, t, info) => {
  const s0 = info.shot.start, a = id => U.L(id) - s0, e = id => U.LE(id) - s0; K.desk(g, t);
  if (t < a('s01_2') - 0.1) {                                                                       // 01.1 titles whip in, 10.1B counts up
    TITLES.forEach((s, i) => { const k = U.appear(t, 0.2 + i * 0.3), x = 120 + (i % 2) * 900, y = 150 + Math.floor(i / 2) * 120; if (k <= 0) return;
      g.save(); g.translate((1 - clamp(k)) * (i % 2 ? 500 : -500), 0); g.rotate((1 - clamp(k)) * (i % 2 ? 0.08 : -0.08)); g.globalAlpha *= clamp(k) * (t > a('s01_1') + 0.9 ? 0.35 : 0.9); rr(g, x, y, 840, 96, 16); U.reg(x, y, 840, 96); g.fillStyle = alpha(K.C.navy2, 0.95); g.fill(); g.strokeStyle = alpha(K.C.violet, 0.5); g.lineWidth = 3; g.stroke();
      text(g, s, x + 24, y + 49, { size: 30, font: U.UI, weight: 700, color: K.C.ink, align: 'left' }); g.restore(); });
    U.tag(g, 'real titles seen on YouTube, 2026-11-26 (vidIQ research), channel names removed', 960, 540, { size: 24 });
    const k = ease.out(prog(t, a('s01_1') + 0.9, a('s01_1') + 1.6)); if (k > 0) { g.save(); g.globalAlpha *= k; const [bx, by] = K.bump(t, a('s01_1') + 2.0, 12, 0.5); g.translate(bx, by); U.count(g, 10.1, t, a('s01_1') + 0.9, a('s01_1') + 2.0, 960, 700, { suf: 'B', size: 250 }); text(g, 'free tokens a month: the claim', 960, 830, { size: 40, font: U.UI, weight: 800, color: K.C.ink }); g.restore(); }
  } else if (t < a('s01_3') - 0.1) {                                                                // 01.2 three setups + 24 runs
    [['A', 'Claude Code|free model', K.C.violet], ['B', 'Claude Code|router', K.C.teal], ['C', 'OpenCode|free Zen model', K.C.blue]].forEach(([L, s, col], i) => { const k = U.appear(t, a('s01_2') + 0.4 + i * 0.5); if (k <= 0) return; const x = 150 + i * 560;
      g.save(); g.globalAlpha *= clamp(k); g.translate(0, (1 - clamp(k)) * 70); U.panel(g, x, 230, 520, 330, col); text(g, 'SETUP ' + L, x + 260, 300, { size: 52, weight: 800, color: K.C.yellow, spacing: 3 });
      s.split('|').forEach((ln, q) => text(g, ln, x + 260, 400 + q * 52, { size: 36, font: U.UI, weight: 800, color: K.C.ink })); g.restore(); });
    U.count(g, 24, t, a('s01_2') + 1.8, a('s01_2') + 3.4, 960, 760, { dec: 0, size: 190 }); text(g, 'real runs · nothing faked', 960, 880, { size: 40, font: U.UI, weight: 800, color: K.C.ink });
  } else if (t < a('s01_4') - 0.1) {                                                                // 01.3 24 ticks (real results)
    U.ticks(g, t, a('s01_3') + 0.2, BENCH.map(r => !!r.ok), 330, 260, 8, 180 * 0.5 + 0, 0.12);
    const k = U.appear(t, a('s01_3') + 0.8); if (k > 0) { g.save(); g.globalAlpha *= clamp(k); text(g, '24 / 24 PASSED', 960, 700, { size: 150, weight: 800, color: K.C.teal, glow: 22, glowColor: alpha(K.C.teal, 0.5) }); g.restore(); }
    U.tag(g, 'checked by running the code and the tests myself, 2026-11-26', 960, 800, { size: 26 });
  } else if (t < a('s01_5') - 0.1) {                                                                // 01.4 the switch teaser
    const k = ease.inOut(prog(t, a('s01_4') + 1.6, a('s01_4') + 2.2)); U.panel(g, 700, 300, 520, 300, K.C.violet); rr(g, 780, 400, 360, 110, 55); g.fillStyle = alpha(k > 0.5 ? K.C.red : K.C.teal, 0.6); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(lerp(835, 1085, k), 455, 42, 0, 7); g.fill();
    text(g, k > 0.5 ? 'OFF' : 'ON', 960, 360, { size: 54, weight: 800, color: k > 0.5 ? K.C.red : K.C.teal, spacing: 4 }); text(g, 'one switch', 960, 700, { size: 70, weight: 800, color: K.C.yellow }); text(g, 'what changed?', 960, 780, { size: 44, font: U.UI, weight: 800, color: K.C.ink });
  } else if (t < a('s01_6') - 0.1) {                                                                // 01.5 plan chips
    ['Where to get it', 'Three tests', 'A harder test', 'The switch', 'The verdict'].forEach((s, i) => { const k = U.appear(t, a('s01_5') + 0.5 + i * 0.7, 0.4); const x = 960 + (i - 2) * 330, y = 420 + (i % 2) * 90; U.chip(g, s, x, y, [K.C.violet, K.C.blue, K.C.teal, K.C.amber, K.C.yellow][i], k, 34); });
    U.tag(g, 'the plan', 960, 330, { size: 36 });
  } else if (t < a('s01_7') - 0.1) {                                                                // 01.6 README claim
    K.windowFrame(g, t, { kind: 'browser', url: 'github.com/tashfeenahmed/freellmapi', t0: a('s01_6') + 0.1, cps: 34, tIn: a('s01_6') - 0.3 });
    const r = FC.FL_README.rect, f = K.fit(r, 4.2, 2.6), m = K.grab(g, 'G_FL_README', t, [{ t: 0, c: [0.5, 0.5], z: 1 }, { t: a('s01_6') + 1.2, c: [0.5, 0.5], z: 1 }, { t: a('s01_6') + 2.6, ...f }]); K.hilite(g, m(r), t, a('s01_6') + 2.8, { label: 'the README says it' }); U.glide(g, t, m(r), a('s01_6') + 1.4, a('s01_6') + 2.7);
    U.tag(g, 'github.com/tashfeenahmed/freellmapi, read 2026-11-26', 960, 96, { size: 24 });
  } else {                                                                                          // 01.7-01.8 poll, answered at once
    const q = U.appear(t, a('s01_7') + 0.1); U.panel(g, 140, 190, 1640, 620, K.C.violet, clamp(q)); if (q > 0) g.globalAlpha = clamp(q);
    text(g, 'Have you tried free Claude Code?', 960, 270, { size: 58, font: U.UI, weight: 800, color: K.C.ink });
    const t8 = a('s01_8'), opts = [['YES', 'you will spot the catches', t8 + 0.1], ['NO', 'you will skip them', t8 + 2.3], ['STUCK', 'this one is for you', t8 + 4.2]];
    opts.forEach(([l, s, ts], i) => { const x = 190 + i * 520, on = t >= ts && (i === 2 || t < opts[i + 1][2]), on2 = t >= ts; rr(g, x, 380, 480, 330, 22); U.reg(x, 380, 480, 330); g.fillStyle = on ? alpha(K.C.violet, 0.9) : alpha(K.C.navy3, 0.9); g.fill(); g.strokeStyle = on ? '#fff' : alpha(K.C.violet, 0.6); g.lineWidth = on ? 5 : 3; g.stroke();
      text(g, l, x + 240, 470, { size: 64, weight: 800, color: on ? '#fff' : K.C.ink, spacing: 3 }); if (on2) text(g, s, x + 240, 600, { size: 36, font: U.UI, weight: 800, color: on ? K.C.yellow : K.C.muted }); });
    g.globalAlpha = 1;
  }
});
