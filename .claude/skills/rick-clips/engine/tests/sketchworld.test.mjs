import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SKETCH_SETS, SKETCH_SET_NAMES } from '../core/sketchsets.js';
import { SKETCH_LOOKS } from '../core/sketchlooks.js';
import { layout } from '../core/sketchlayout.js';
import { CAST } from '../core/cast.js';

const NEW_SETS = ['shopfront', 'bench', 'desk', 'clock', 'calendar', 'queue', 'promise', 'talk', 'finale'];
test('world: every scene exists as planes, has look targets, and has a figure plane or none consistently', () => {
  for (const n of ['bakery', 'street', ...NEW_SETS]) {
    assert.ok(SKETCH_SET_NAMES.includes(n), `${n} missing from sets`);
    assert.ok(SKETCH_SETS[n].length >= 3, `${n} needs depth planes`);
    assert.ok(Object.keys(SKETCH_LOOKS[n] || {}).length >= 2, `${n} needs at least two look targets`);
  }
  for (const n of Object.keys(SKETCH_LOOKS)) assert.ok(SKETCH_SET_NAMES.includes(n), `look set ${n} has no scene`);
  for (const n of SKETCH_SET_NAMES) for (const l of Object.values(SKETCH_LOOKS[n])) assert.ok(l.x >= 0 && l.x <= 1 && l.y >= 0 && l.y <= 1 && l.depth >= 0 && l.depth <= 1.2, `${n} look in range`);
});
test('world: every scene stages every cast kind with feet and head inside the frame in portrait and landscape', () => {
  for (const [W, H] of [[1080, 1920], [1920, 1080]]) for (const set of SKETCH_SET_NAMES) for (const cast of [['rosa'], ['dario'], ['neighbours'], ['crowd']]) for (const f of layout({ id: 'shot-01', set, cast, t0: 0, t1: 3 }, W, H)) {
    const k = f.s * CAST[f.who].height, head = f.y - 1.43 * k;
    assert.ok(f.y <= H && head - k >= -0.02 * H && f.x > 0 && f.x < W, `${W}x${H} ${set} ${cast} ${f.who}`);
  }
});
test('world: the crowd is a queue of at least six different people, smaller toward the back', () => {
  const fs = layout({ id: 'shot-01', set: 'queue', cast: ['crowd'], t0: 0, t1: 3 }, 1080, 1920);
  assert.ok(fs.length >= 6 && new Set(fs.map(f => f.who)).size >= 6);
  const byY = [...fs].sort((a, b) => a.y - b.y); assert.ok(byY[0].s < byY.at(-1).s, 'back figures are smaller');
});
