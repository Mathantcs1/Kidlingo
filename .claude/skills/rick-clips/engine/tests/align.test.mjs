import { test } from 'node:test';
import assert from 'node:assert/strict';
import { alignWords } from '../core/align.js';

test('align: equal counts map one to one and keep the SCRIPT spelling', () => {
  const w = alignWords('the neighbours wave', [['the', 0, 0.2], ['neighbors', 0.2, 0.7], ['wave', 0.7, 1]]);
  assert.deepEqual(w.map(x => x.text), ['the', 'neighbours', 'wave']);
  assert.deepEqual(w.map(x => x.start), [0, 0.2, 0.7]);
});
test('align: a negative first start from the speech check is clamped to 0', () => {
  const w = alignWords('Every night', [['Every', -0.6, 0.12], ['night', 0.12, 0.44]]);
  assert.equal(w[0].start, 0);
});
test('align: differing counts (twenty-four vs twenty four) stay in order, no overlap, span the same range', () => {
  const asr = [['Camera', 0, 0.4], ['twenty', 0.4, 0.8], ['four', 0.8, 1.2], ['saw', 1.2, 1.6]];
  const w = alignWords('Camera twenty-four saw', asr);
  assert.equal(w.length, 3);
  assert.equal(w[0].start, 0);
  assert.equal(w.at(-1).end, 1.6);
  for (let i = 1; i < w.length; i++) assert.ok(w[i].start >= w[i - 1].end - 1e-9, 'no overlap');
});
test('align: empty speech result gives an empty list rather than NaN timings', () => {
  assert.deepEqual(alignWords('hello there', []), []);
});
test('align: numbers and punctuation are kept verbatim', () => {
  const w = alignWords('Forty, 40% wow!', [['forty', 0, 0.3], ['forty', 0.3, 0.7], ['wow', 0.7, 1]]);
  assert.deepEqual(w.map(x => x.text), ['Forty,', '40%', 'wow!']);
});

test('align: a lone dash is not a caption and "then" keeps its real time after a long pause', () => {
  const asr = [['He', 0, .3], ['paused', .3, .9], ['then', 4.1, 4.4], ['ran', 4.4, 4.8]];
  const w = alignWords('He paused — then ran.', asr);
  assert.deepEqual(w.map(x => x.text), ['He', 'paused', 'then', 'ran.']);
  assert.equal(w[2].start, 4.1);
});
test('align: "$1,500." (heard as three words) spans them and the next word keeps its time after the pause', () => {
  const asr = [['It', 0, .2], ['cost', .2, .5], ['fifteen', .5, .9], ['hundred', .9, 1.2], ['dollars', 1.2, 1.7], ['then', 4.9, 5.2], ['silence', 5.2, 5.9]];
  const w = alignWords('It cost $1,500. Then silence.', asr);
  assert.deepEqual(w.map(x => x.text), ['It', 'cost', '$1,500.', 'Then', 'silence.']);
  assert.equal(w[2].start, .5); assert.equal(w[2].end, 1.7);
  assert.equal(w[3].start, 4.9);
});
test('align: the fallback reports itself so the build can warn', () => {
  const msgs = [];
  alignWords('It cost $1,500. Then', [['It', 0, .2], ['cost', .2, .5], ['fifteen', .5, .9], ['hundred', .9, 1.2], ['then', 4.9, 5.2]], m => msgs.push(m));
  assert.equal(msgs.length, 1);
  assert.match(msgs[0], /\$1,500/);
});
