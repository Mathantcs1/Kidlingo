import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseScript, compileTimeline, wordsFromLines } from '../core/script.js';

const SRC = `[set=cellblock cam=wide face=flat]
Lights out. Again, he smiled.

[set=cellblock cam=face face=smug]
Nobody ever checks the mattress.

[set=vault cam=low]
The guard just wanted coffee.

[set=cellblock cam=high overlay=cctv]
Camera twenty-four saw everything.

[set=cellblock cam=face cut=fade]
Rude.
`;

test('script: blocks keep text and directives', () => {
  const s = parseScript(SRC);
  assert.equal(s.length, 5);
  assert.equal(s[1].id, 'shot-02');
  assert.equal(s[1].text, 'Nobody ever checks the mattress.');
  assert.equal(s[1].face, 'smug');
  assert.equal(s[3].overlay, 'cctv');
});
test('script: no boundary is a bare hard cut by default: set change fades, close-up punches in, other same-set moves whip', () => {
  const s = parseScript(SRC);
  assert.equal(s[1].transition, 'punch');   // same set, cam=face
  assert.equal(s[2].transition, 'fade');    // set change
  const w = parseScript('[set=a cam=wide]\nx\n\n[set=a cam=high]\ny');
  assert.equal(w[1].transition, 'whip');    // same set, not a close-up
});
test('script: a hard cut happens only when the script says cut=cut; whip and punch can be asked for', () => {
  const s = parseScript('[set=a]\nx\n\n[set=a cam=face cut=cut]\ny\n\n[set=a cut=whip]\nz\n\n[set=a cut=punch]\nw');
  assert.deepEqual(s.slice(1).map(x => x.transition), ['cut', 'whip', 'punch']);
});
test('script: overlay=cctv implies the cctv transition; explicit cut= overrides inference', () => {
  const s = parseScript(SRC);
  assert.equal(s[3].transition, 'cctv');
  assert.equal(s[4].transition, 'fade');
});
test('script: text before the first directive line is an error', () => {
  assert.throws(() => parseScript('Hello there\n[set=a]\nx'), /must start with a \[directive\] line/);
});
test('script: a block without narration text is an error', () => {
  assert.throws(() => parseScript('[set=a]\n\n[set=a]\nhi'), /shot-01 has no text/);
});
test('script: unknown transition value is an error', () => {
  assert.throws(() => parseScript('[set=a cut=spin]\nhi'), /unknown cut "spin"/);
});

test('compile: shots start at their voice line start with a gap; last shot gets a tail', () => {
  const shots = parseScript('[set=a]\none\n\n[set=a]\ntwo');
  const tl = compileTimeline(shots, [2, 3], { gap: 0.2, tail: 0.6 });
  assert.deepEqual(tl.map(s => [s.t0, s.t1]), [[0, 2.2], [2.2, 5.8]]);
  assert.equal(tl.at(-1).voiceT0, 2.2);
});
test('compile: caption words are offset by their shot start', () => {
  const shots = parseScript('[set=a]\none\n\n[set=a]\ntwo');
  const tl = compileTimeline(shots, [2, 3], { gap: 0.2, tail: 0.6 });
  const words = wordsFromLines(tl, [[{ text: 'one', start: 0.1, end: 0.5 }], [{ text: 'two', start: 0.0, end: 0.4 }]]);
  assert.deepEqual(words, [{ text: 'one', start: 0.1, end: 0.5 }, { text: 'two', start: 2.2, end: 2.6 }]);
});

test('script: cast directive becomes a list; missing cast is an empty list', () => {
  const s = parseScript('[set=a cast=baker,neighbours]\nhi\n\n[set=a]\nyo');
  assert.deepEqual(s[0].cast, ['baker', 'neighbours']);
  assert.deepEqual(s[1].cast, []);
});

import { validateShots } from '../core/script.js';
test('script: validateShots rejects an unknown set and names the valid ones', () => {
  const shots = parseScript('[set=moon]\nhi');
  assert.throws(() => validateShots(shots, ['bakery', 'street']), /shot-01: unknown set "moon" \(use bakery, street\)/);
  assert.doesNotThrow(() => validateShots(parseScript('[set=bakery]\nhi'), ['bakery', 'street']));
});
test('script: validateShots rejects an unknown cam', () => {
  assert.throws(() => validateShots(parseScript('[set=bakery cam=dolly]\nhi'), ['bakery']), /shot-01: unknown cam "dolly"/);
});

test('script: cut=cctv also sets the cctv overlay (page and mix act on overlay)', () => {
  const s = parseScript('[set=a]\nx\n\n[set=a cut=cctv]\ny');
  assert.equal(s[1].transition, 'cctv'); assert.equal(s[1].overlay, 'cctv');
});
test('script: an unknown directive key is an error naming the valid keys', () => {
  assert.throws(() => parseScript('[set=a camm=face]\nhi'), /shot-01: unknown directive "camm" \(use set, cam, face, cast, overlay, cut, look, frame\)/);
});
test('script: validateShots rejects unknown face, cast and overlay values', () => {
  const v = src => validateShots(parseScript(src), ['bakery']);
  assert.throws(() => v('[set=bakery face=smugg]\nhi'), /shot-01: unknown face "smugg" \(use flat, smug, shock\)/);
  assert.throws(() => v('[set=bakery cast=wizard]\nhi'), /shot-01: unknown cast "wizard" \(use baker, neighbours, none\)/);
  assert.throws(() => v('[set=bakery overlay=vhs]\nhi'), /shot-01: unknown overlay "vhs" \(use cctv\)/);
  assert.doesNotThrow(() => v('[set=bakery face=smug cast=baker,neighbours overlay=cctv]\nhi'));
});

import { FACES } from '../core/rig.js';
import { FACE_NAMES } from '../core/vocab.js';
test('vocab: every script face name exists in the rig and vice versa', () => {
  assert.deepEqual(Object.keys(FACES).sort(), [...FACE_NAMES].sort());
});

import { SKETCH_VOCAB } from '../core/vocab.js';
test('sketch style: set change flips the page, a move into a close-up inks in, other same-set moves scribble', () => {
  const s = parseScript('[set=a cam=wide]\nx\n\n[set=b cam=wide]\ny\n\n[set=b cam=face]\nz\n\n[set=b cam=high]\nw', { style: 'sketch' });
  assert.deepEqual(s.slice(1).map(x => x.transition), ['flip', 'ink', 'scribble']);
});
test('sketch style: flip, ink and scribble can be asked for explicitly; the default style is unchanged', () => {
  const s = parseScript('[set=a]\nx\n\n[set=a cut=flip]\ny\n\n[set=a cut=ink]\nz\n\n[set=a cut=scribble]\nw', { style: 'sketch' });
  assert.deepEqual(s.slice(1).map(x => x.transition), ['flip', 'ink', 'scribble']);
  assert.equal(parseScript('[set=a]\nx\n\n[set=a cam=face]\ny')[1].transition, 'punch');
});
test('each style only accepts the transitions its page can draw (no silent black frames)', () => {
  const classic = c => () => parseScript(`[set=a]\nx\n\n[set=a cut=${c}]\ny`), sketch = c => () => parseScript(`[set=a]\nx\n\n[set=a cut=${c}]\ny`, { style: 'sketch' });
  for (const c of ['flip', 'ink', 'scribble']) assert.throws(classic(c), new RegExp(`unknown cut "${c}" \\(use cut, fade, cctv, whip, punch\\)`));
  for (const c of ['punch', 'cctv']) assert.throws(sketch(c), new RegExp(`unknown cut "${c}" \\(use cut, fade, whip, flip, ink, scribble\\)`));
  for (const c of ['cut', 'fade', 'whip', 'flip', 'ink', 'scribble']) assert.doesNotThrow(sketch(c), c);
});
test('sketch vocab: unknown face, old-style cast and the cctv overlay are rejected with the sketch lists', () => {
  const v = src => validateShots(parseScript(src, { style: 'sketch' }), ['bakery', 'street'], SKETCH_VOCAB);
  assert.throws(() => v('[set=bakery face=smugg]\nhi'), /unknown face "smugg" \(use flat, smug, shock, joy\)/);
  assert.throws(() => v('[set=bakery cast=baker]\nhi'), /unknown cast "baker" \(use rosa, dario, neighbours, crowd, none\)/);
  assert.throws(() => v('[set=bakery overlay=cctv]\nhi'), /unknown overlay "cctv" \(use none\)/);
  assert.doesNotThrow(() => v('[set=bakery face=joy cast=rosa,neighbours]\nhi'));
});
