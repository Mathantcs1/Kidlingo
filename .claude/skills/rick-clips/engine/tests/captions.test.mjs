import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCaptionTrack, captionAt } from '../core/captions.js';

const MIN = 0.25;

test('captions: never overlap, and a word is never delayed past its own start', () => {
  const track = buildCaptionTrack([
    { text: 'Clean', start: 0, end: 0.2 },
    { text: 'and', start: 0.2, end: 0.3 },
  ]);
  assert.equal(track.length, 2);
  assert.equal(track[1].t0, 0.2);
  assert.ok(track[0].t1 <= track[1].t0 + 1e-9, 'no overlap');
});
test('captions: 12 fast words (0.12 s each) each appear exactly at their word start', () => {
  const words = Array.from({ length: 12 }, (_, i) => ({ text: `w${i}`, start: i * 0.12, end: (i + 1) * 0.12 }));
  const track = buildCaptionTrack(words);
  track.forEach((c, i) => assert.ok(Math.abs(c.t0 - words[i].start) < 1e-9, `w${i} lag`));
  assert.ok(track.at(-1).t1 <= 1.44 + 0.25 + 1e-9);
});
test('captions: a short last word holds the minimum 0.25 s when nothing follows it', () => {
  const [c] = buildCaptionTrack([{ text: 'Rude.', start: 1, end: 1.1 }]);
  assert.ok(Math.abs(c.t1 - c.t0 - 0.25) < 1e-9);
});
test('captions: a caption never crosses a shot cut', () => {
  const track = buildCaptionTrack([{ text: 'to.', start: 2.7, end: 2.75 }], { cuts: [2.8] });
  assert.ok(track[0].t1 <= 2.8 + 1e-9);
});
test('captions: a 3 s pause yields no caption inside the gap', () => {
  const track = buildCaptionTrack([
    { text: 'a', start: 0, end: 0.3 },
    { text: 'b', start: 3.3, end: 3.6 },
  ]);
  assert.equal(captionAt(track, 0.1), 'a');
  assert.equal(captionAt(track, 1.5), null);
  assert.equal(captionAt(track, 3.4), 'b');
});

test('captions: empty input gives an empty track', () => {
  assert.deepEqual(buildCaptionTrack([]), []);
});

test('captions: punctuation and numbers are kept verbatim', () => {
  const track = buildCaptionTrack([
    { text: 'search,', start: 0, end: 0.4 },
    { text: '42%', start: 0.4, end: 0.8 },
  ]);
  assert.deepEqual(track.map(c => c.text), ['search,', '42%']);
});
