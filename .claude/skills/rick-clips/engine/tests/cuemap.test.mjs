import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkCueMap } from '../core/cuemap.js';

const words = [{ text: 'a', start: 0, end: 0.4 }, { text: 'b', start: 2.8, end: 3.2 }];
const FPS = 30;

test('cuemap: flags a cut more than 1 frame from its word boundary', () => {
  const v = checkCueMap([{ t: 2.9, type: 'cut' }], words, FPS);
  assert.equal(v.length, 1);
  assert.match(v[0], /cut at 2.9/);
});
test('cuemap: passes when every cut lands on a word start (within 1 frame)', () => {
  assert.deepEqual(checkCueMap([{ t: 2.8, type: 'cut' }, { t: 0.02, type: 'cut' }], words, FPS), []);
});
test('cuemap: ignores non-cut cues', () => {
  assert.deepEqual(checkCueMap([{ t: 1.23, type: 'sfx' }], words, FPS), []);
});
