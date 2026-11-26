// S08 the race: three panels, live timers (real run-one finish times, timers sped up on screen), REAL test output, REAL hash check
import { E, ease, clamp, lerp, prog, alpha, rr } from '/engine/core.js';
import * as K from '../kit.js';
import * as U from '../sets/fc_ui.js';
const text = U.text;
import { BENCH, PASS, SHA, RES } from '../sets/fc_data2.js';
const RUN1 = { A: BENCH.find(r => r.task === 'bug' && r.setup === 'A' && r.i === 1).secs, B: BENCH.find(r => r.task === 'bug' && r.setup === 'B' && r.i === 1).secs, C: BENCH.find(r => r.task === 'bug' && r.setup === 'C' && r.i === 1).secs };
U.shot('ia_s08', 'THE RACE', (g, t, info) => {
  const s0 = info.shot.start, a = id => U.L(id) - s0, e = id => U.LE(id) - s0; K.desk(g, t);
  if (t < a('s08_4') - 0.1) {
    const t0 = a('s08_1') + 1.4, tA = a('s08_2') + 1.0, tC = a('s08_3') + 0.6, tB = a('s08_3') + 2.4, fin = { A: tA, C: tC, B: tB };
    const clock = (S) => { const an = [[t0, 0], [tA, RUN1.A], [tC, RUN1.C], [tB, RUN1.B]]; const real = U.pw(t, an); return Math.min(real, RUN1[S]); };
    [['A', 'Claude Code → free model', K.C.violet], ['B', 'Claude Code → router', K.C.teal], ['C', 'OpenCode → Big Pickle', K.C.blue]].forEach(([S, name, col], i) => { const k = U.appear(t, a('s08_1') + 0.2 + i * 0.3); if (k <= 0) return; const x = 90 + i * 600, done = t >= fin[S];
      g.save(); g.globalAlpha *= clamp(k); U.panel(g, x, 170, 570, 700, done ? K.C.teal : col); text(g, 'SETUP ' + S, x + 285, 225, { size: 46, weight: 800, color: K.C.yellow }); text(g, name, x + 285, 285, { size: 30, font: U.UI, weight: 800, color: K.C.ink });
      text(g, 'claude -p "fix inventory.py…"'.replace('claude -p', S === 'C' ? 'opencode run' : 'claude -p'), x + 285, 345, { size: 24, font: K.MONO, weight: 600, color: K.C.muted });
      const v = t < t0 ? 0 : clock(S); text(g, v.toFixed(1) + ' s', x + 285, 520, { size: 120, font: U.BIG, weight: 800, color: done ? K.C.teal : K.C.ink });
      if (!done && t > t0) text(g, 'working…', x + 285, 620, { size: 34, font: U.UI, weight: 800, color: K.C.muted });
      if (done) { const q = U.appear(t, fin[S]); g.save(); g.globalAlpha *= clamp(q); text(g, 'PASS', x + 285, 640, { size: 86, weight: 800, color: K.C.teal, glow: 18, glowColor: alpha(K.C.teal, 0.5) }); text(g, PASS[PASS.length - 3], x + 285, 730, { size: 26, font: K.MONO, weight: 600, color: K.C.ink }); text(g, 'OK', x + 285, 780, { size: 34, font: K.MONO, weight: 800, color: K.C.teal }); g.restore(); } g.restore(); });
    U.tag(g, 'timers sped up on screen; each stops at its real finish time from the logged run 1', 960, 96, { size: 22 });
  } else if (t < a('s08_5') - 0.1) {                                                                // 08.4 no cheating: real hashes
    const f = U.lines(g, t, [['$ sha256sum test_inventory.py   # before the run', '#5ad67a'], [SHA[0] + '…  test_inventory.py', K.C.ink], ['$ sha256sum test_inventory.py   # after the run', '#5ad67a'], [SHA[1] + '…  test_inventory.py', K.C.ink]], { title: 'real hash check, run 1 of setup A', tIn: a('s08_4') - 0.3, size: 30 });
    if (t > a('s08_4') + 2.0) K.stamp(g, '  UNCHANGED  ', 1300, 780, t, a('s08_4') + 2.0, { color: K.C.teal, size: 56 });
  } else if (t < a('s08_6') - 0.1) {                                                                // 08.5 nine ticks
    U.ticks(g, t, a('s08_5') + 0.2, BENCH.filter(r => r.task === 'bug').map(r => !!r.ok), 660, 330, 3, 270, 0.2); text(g, '9 / 9', 960, 770, { size: 170, weight: 800, color: K.C.teal, glow: 22, glowColor: alpha(K.C.teal, 0.5) }); U.tag(g, '3 runs × 3 setups, all checked by running the tests', 960, 880, { size: 24 });
  } else {                                                                                          // 08.6 how I score
    U.panel(g, 330, 240, 1260, 480, K.C.violet); U.kin(g, 'HOW I SCORE A PASS', 960, 330, t, a('s08_6') + 0.1, { size: 56, spacing: 3 }); ['all 5 tests pass', 'test file unchanged', 'code style not judged'].forEach((s, i) => { const k = U.appear(t, a('s08_6') + 0.8 + i * 1.2); g.save(); g.globalAlpha *= clamp(k); text(g, (i < 2 ? '✓  ' : '✗  ') + s, 960, 450 + i * 80, { size: 46, font: U.UI, weight: 800, color: i < 2 ? K.C.teal : K.C.muted }); g.restore(); });
  }
});
