import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, compileTimeline, expandBeats } from '../core/script.js';

const SRC = `[set=bakery cam=wide cast=rosa]
Rosa opened a {cam=face face=smug} tiny bakery with {cam=pull} one rule.
`;
const words = (t0, list) => list.map((text, i) => ({ text, start: t0 + i * 0.5, end: t0 + i * 0.5 + 0.4 }));

test('beats: inline tags split a block into beats at the next spoken word and are stripped from the text', () => {
  const [b] = parseScript(SRC, { style: 'sketch' });
  assert.equal(b.text, 'Rosa opened a tiny bakery with one rule.');
  assert.deepEqual(b.beats.map(x => [x.at, x.d]), [[3, { cam: 'face', face: 'smug' }], [6, { cam: 'pull' }]]);
});
test('beats: a punctuation-only token does not count as a word when placing a beat', () => {
  const [b] = parseScript('[set=a]\nWait — {cam=face} what?', { style: 'sketch' });
  assert.equal(b.beats[0].at, 1);
});
test('beats: an unknown key inside a tag is an error naming the shot', () => {
  assert.throws(() => parseScript('[set=a]\nhi {camm=face} there', { style: 'sketch' }), /shot-01: unknown directive "camm"/);
});
test('beats: expandBeats cuts on the beat words, inherits directives, and ids the sub-shots', () => {
  const blocks = compileTimeline(parseScript(SRC, { style: 'sketch' }), [4], { gap: 0.2, tail: 0.5 });
  const w = words(blocks[0].voiceT0, 'Rosa opened a tiny bakery with one rule.'.split(' '));
  const out = expandBeats(blocks, [w], { style: 'sketch' });
  assert.deepEqual(out.map(s => s.id), ['shot-01a', 'shot-01b', 'shot-01c']);
  assert.deepEqual(out.map(s => s.t0), [0, w[3].start, w[6].start]);
  assert.equal(out[0].t1, out[1].t0); assert.equal(out[2].t1, blocks[0].t1);
  assert.deepEqual(out.map(s => s.cam), ['wide', 'face', 'pull']);
  assert.equal(out[1].face, 'smug'); assert.equal(out[2].face, 'smug', 'a later beat inherits the earlier beat');
  assert.deepEqual(out.slice(1).map(s => s.transition), ['cut', 'cut']);
});
test('beats: a beat without cam= gets a camera different from the previous shot (always moving, never repeated)', () => {
  const blocks = compileTimeline(parseScript('[set=a cam=push]\nOne two three {face=smug} four five six {face=joy} seven eight.', { style: 'sketch' }), [6], { gap: 0.2, tail: 0.5 });
  const out = expandBeats(blocks, [words(0, 'One two three four five six seven eight.'.split(' '))], { style: 'sketch' });
  for (let i = 1; i < out.length; i++) assert.notEqual(out[i].cam, out[i - 1].cam);
});
test('beats: a set change inside a block uses a quick transition; a beat under 0.5 s is refused', () => {
  const blocks = compileTimeline(parseScript('[set=bakery]\nOne two {set=street} three four.', { style: 'sketch' }), [3], { gap: 0.2, tail: 0.5 });
  assert.equal(expandBeats(blocks, [words(0, 'One two three four.'.split(' '))], { style: 'sketch' })[1].transition, 'whip');   // quick: a page turn (0.6 s) would swallow a ~1 s shot
  const tight = [{ text: 'a', start: 0, end: 0.1 }, { text: 'b', start: 0.2, end: 0.3 }, { text: 'c', start: 0.4, end: 0.5 }];
  const b2 = compileTimeline(parseScript('[set=a]\na b {cam=face} c', { style: 'sketch' }), [1], { gap: 0.2, tail: 0.5 });
  assert.throws(() => expandBeats(b2, [tight], { style: 'sketch' }), /shot-01: .*under 0\.5 s/);
});

import { validateShots } from '../core/script.js';
import { SKETCH_VOCAB } from '../core/vocab.js';
test('look: a beat can cut to an insert of a set object, and the look applies to that beat only', () => {
  const blocks = compileTimeline(parseScript('[set=bakery cam=wide cast=rosa]\nOne two {look=oven cam=push} three four {cam=face} five six.', { style: 'sketch' }), [6], { gap: 0.2, tail: 0.5 });
  const out = expandBeats(blocks, [words(0, 'One two three four five six.'.split(' '))], { style: 'sketch' });
  assert.deepEqual(out.map(s => s.look ?? null), [null, 'oven', null]);
});
test('look: a look that does not exist in the set is refused with the valid ones', () => {
  const v = src => validateShots(parseScript(src, { style: 'sketch' }), ['bakery', 'street'], SKETCH_VOCAB);
  assert.throws(() => v('[set=street look=oven]\nhi'), /shot-01: unknown look "oven" for set street \(use lamp, moon, houses, tree\)/);
  assert.doesNotThrow(() => v('[set=bakery look=oven cam=push]\nhi'));
});

test('beats: successive set changes inside a block rotate through the quick transitions so they do not all look alike', () => {
  const blocks = compileTimeline(parseScript('[set=a]\nw1 w2 {set=b} w3 w4 {set=c} w5 w6 {set=d} w7 w8 {set=e} w9 w10', { style: 'sketch' }), [6], { gap: 0.2, tail: 0.5 });
  const out = expandBeats(blocks, [words(0, 'w1 w2 w3 w4 w5 w6 w7 w8 w9 w10'.split(' '))], { style: 'sketch' });
  assert.deepEqual(out.slice(1).map(s => s.transition), ['whip', 'scribble', 'ink', 'whip']);
});
