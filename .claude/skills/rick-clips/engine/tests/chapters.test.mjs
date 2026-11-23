import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitChapters, chapterHash } from '../core/chapters.js';

const mk = (n, len) => Array.from({ length: n }, (_, i) => ({ id: `shot-${i + 1}`, t0: i * len, t1: (i + 1) * len }));

test('chapters: chapters are 20–40 s unless the whole film is shorter', () => {
  const ch = splitChapters(mk(30, 4), { min: 20, max: 40 });   // 120 s
  assert.ok(ch.length >= 3);
  for (const c of ch) assert.ok(c.t1 - c.t0 >= 20 && c.t1 - c.t0 <= 40, `${c.id} ${c.t1 - c.t0}`);
});
test('chapters: a film shorter than max is a single chapter', () => {
  const ch = splitChapters(mk(8, 4), { min: 20, max: 40 });    // 32 s
  assert.equal(ch.length, 1);
  assert.equal(ch[0].id, 'chapter-01');
});
test('chapters: a split never cuts inside a shot and covers every shot once, in order', () => {
  const shots = mk(30, 4);
  const ch = splitChapters(shots, { min: 20, max: 40 });
  assert.deepEqual(ch.flatMap(c => c.shots.map(s => s.id)), shots.map(s => s.id));
  for (let i = 1; i < ch.length; i++) assert.equal(ch[i].t0, ch[i - 1].t1);
});
test('chapters: uneven shot lengths still respect the max', () => {
  const lens = [3, 9, 4, 8, 2, 7, 5, 6, 3, 9, 4, 8, 2, 7, 5, 6];  // 98 s
  let t = 0; const shots = lens.map((l, i) => ({ id: `s${i}`, t0: t, t1: (t += l) }));
  for (const c of splitChapters(shots, { min: 20, max: 40 })) assert.ok(c.t1 - c.t0 <= 40, `${c.id} ${c.t1 - c.t0}`);
});
test('chapters: hash is stable for equal content and changes when a shot or the salt changes', () => {
  const [c] = splitChapters(mk(8, 4), { min: 20, max: 40 });
  assert.equal(chapterHash(c, 'cfg'), chapterHash(structuredClone(c), 'cfg'));
  const edited = structuredClone(c); edited.shots[2].text = 'changed';
  assert.notEqual(chapterHash(c, 'cfg'), chapterHash(edited, 'cfg'));
  assert.notEqual(chapterHash(c, 'cfg'), chapterHash(c, 'other-size'));
});

test('chapters: re-voiced words with the same shot durations change the hash', () => {
  const [c] = splitChapters(mk(8, 4), { min: 20, max: 40 });
  const a = { ...c, words: [{ text: 'hi', start: 0, end: 0.4 }] }, b = { ...c, words: [{ text: 'hi', start: 0, end: 0.5 }] };
  assert.notEqual(chapterHash(a, 's'), chapterHash(b, 's'));
});
