import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layout } from '../core/sketchlayout.js';
import { CAST } from '../core/cast.js';

const FORMATS = [[1080, 1920], [1920, 1080]];
const shot = (set, cast) => ({ id: 'shot-01', set, cast, t0: 0, t1: 3 });
const CASTS = [['rosa'], ['dario'], ['neighbours'], ['rosa', 'neighbours'], ['dario', 'neighbours'], ['rosa', 'dario']];

test('layout: every figure keeps its feet, whole head and hat inside the frame in portrait AND landscape', () => {
  for (const [W, H] of FORMATS) for (const set of ['bakery', 'street']) for (const cast of CASTS) for (const f of layout(shot(set, cast), W, H)) {
    const k = f.s * CAST[f.who].height, headCenter = f.y - 1.43 * k;
    assert.ok(f.y <= H, `${W}x${H} ${set} ${cast} ${f.who} feet ${f.y}`);
    assert.ok(headCenter - 1.0 * k >= 0, `${W}x${H} ${set} ${cast} ${f.who} hat top ${headCenter - k}`);
    assert.ok(f.x > 0 && f.x < W, `${W}x${H} ${f.who} x ${f.x}`);
  }
});
test('layout: two leads stand apart, and leads never cover the neighbours', () => {
  for (const [W, H] of FORMATS) {
    const two = layout(shot('bakery', ['rosa', 'dario']), W, H);
    assert.ok(Math.abs(two[0].x - two[1].x) >= 0.25 * W, `${W}x${H} leads stacked`);
    for (const lead of ['rosa', 'dario']) {
      const fs = layout(shot('street', [lead, 'neighbours']), W, H);
      for (const a of fs) for (const b of fs) if (a !== b) assert.ok(Math.abs(a.x - b.x) >= 0.3 * (a.s * CAST[a.who].height + b.s * CAST[b.who].height), `${W}x${H} ${lead}: ${a.who} overlaps ${b.who}`);
    }
  }
});
test('layout: more than one lead together with the neighbours is refused with the shot id', () => {
  assert.throws(() => layout(shot('street', ['rosa', 'dario', 'neighbours']), 1080, 1920), /shot-01: too many characters/);
});
test('layout: the first cast member is the lead the camera follows, whatever the draw order', () => {
  const fs = layout(shot('street', ['neighbours']), 1080, 1920);
  assert.equal(fs.filter(f => f.lead).length, 1);
  assert.equal(fs.find(f => f.lead).who, 'bea');
});
