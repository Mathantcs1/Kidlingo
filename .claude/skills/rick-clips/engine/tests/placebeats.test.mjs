import { test } from 'node:test';
import assert from 'node:assert/strict';
import { placeBeats } from '../core/beats.js';

const W = (n, step = 0.4, punct = {}) => Array.from({ length: n }, (_, i) => ({ text: `w${i}${punct[i] || ''}`, start: i * step, end: i * step + step * 0.9 }));

test('placeBeats: spreads n shots evenly across the line, every shot >= 0.55 s', () => {
  const w = W(12), idx = placeBeats(w, 3);
  assert.equal(idx.length, 2);
  const starts = [0, ...idx.map(i => w[i].start)], end = w.at(-1).end + 0.15;
  for (let k = 0; k < starts.length; k++) assert.ok((starts[k + 1] ?? end) - starts[k] >= 0.55 - 1e-9, `shot ${k}`);
  assert.ok(idx.every((v, k) => k === 0 || v > idx[k - 1]));
});
test('placeBeats: prefers to cut right after punctuation (a natural phrase break)', () => {
  const w = W(12, 0.4, { 3: ',', 7: '.' });
  assert.deepEqual(placeBeats(w, 3), [4, 8]);
});
test('placeBeats: asks for more shots than fit, and gets fewer (never a shot under the minimum)', () => {
  const w = W(4, 0.3), idx = placeBeats(w, 6), starts = [0, ...idx.map(i => w[i].start)], end = w.at(-1).end + 0.15;
  assert.ok(idx.length < 5);
  for (let k = 0; k < starts.length; k++) assert.ok((starts[k + 1] ?? end) - starts[k] >= 0.55 - 1e-9);
});
test('placeBeats: one shot (or an empty line) needs no beats', () => {
  assert.deepEqual(placeBeats(W(8), 1), []);
  assert.deepEqual(placeBeats([], 3), []);
});
