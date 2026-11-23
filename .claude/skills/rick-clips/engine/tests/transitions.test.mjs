import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shotAt, crossfade } from '../core/transitions.js';

const shots = [{ id: 'wide', t0: 0, t1: 2.8 }, { id: 'face', t0: 2.8, t1: 5 }];

test('transitions: shotAt cuts exactly on the boundary (hard cut)', () => {
  assert.equal(shotAt(shots, 2.79).id, 'wide');
  assert.equal(shotAt(shots, 2.8).id, 'face');
});
test('transitions: shotAt clamps to first/last shot outside the film', () => {
  assert.equal(shotAt(shots, -1).id, 'wide');
  assert.equal(shotAt(shots, 99).id, 'face');
});
test('transitions: crossfade alpha is 0 before, 1 after, 0.5 at the middle', () => {
  const a = crossfade(1, 2);
  assert.equal(a(0), 0);
  assert.equal(a(3), 1);
  assert.ok(Math.abs(a(1.5) - 0.5) < 1e-9);
});

import { transitionWindow, TRANSITION_HALF } from '../core/transitions.js';
const S = [{ id: 'a', t0: 0, t1: 3, transition: 'cut' }, { id: 'b', t0: 3, t1: 6, transition: 'whip' }, { id: 'c', t0: 6, t1: 9, transition: 'cut' }, { id: 'd', t0: 9, t1: 12, transition: 'fade' }];
test('transitions: the window is centred on the boundary (the first spoken word) and k runs 0..1 across it', () => {
  const h = TRANSITION_HALF.whip;
  assert.equal(transitionWindow(S, 3 - h - 0.01), null);
  const mid = transitionWindow(S, 3);
  assert.equal(mid.type, 'whip'); assert.equal(mid.prev.id, 'a'); assert.equal(mid.next.id, 'b');
  assert.ok(Math.abs(mid.k - 0.5) < 1e-9);
  assert.ok(transitionWindow(S, 3 - h).k < 0.01);
  assert.equal(transitionWindow(S, 3 + h), null);
});
test('transitions: an explicit hard cut and the first shot never open a window', () => {
  assert.equal(transitionWindow(S, 6), null);
  assert.equal(transitionWindow(S, 0), null);
});
test('transitions: every non-cut transition type has a half-width, and a fade is the widest', () => {
  for (const t of ['fade', 'whip', 'punch', 'cctv']) assert.ok(TRANSITION_HALF[t] > 0, t);
  assert.ok(TRANSITION_HALF.fade >= TRANSITION_HALF.whip);
  assert.equal(transitionWindow(S, 9).type, 'fade');
});

test('transitions: the sketch transitions have half-widths and open windows', () => {
  for (const t of ['scribble', 'flip', 'ink']) assert.ok(TRANSITION_HALF[t] > 0, t);
  const shots = [{ id: 'a', t0: 0, t1: 3, transition: 'cut' }, { id: 'b', t0: 3, t1: 6, transition: 'flip' }];
  assert.equal(transitionWindow(shots, 3).type, 'flip');
});
