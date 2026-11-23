import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkVariety } from '../core/variety.js';

const mk = (list, dur = 4) => list.map(([set, cam, look = null], i) => ({ id: `shot-${i + 1}`, set, cam, look, t0: i * dur, t1: (i + 1) * dur }));

test('variety: a film of two scenes is refused ("scenes should show what the voice says")', () => {
  const shots = mk(Array.from({ length: 30 }, (_, i) => [i % 2 ? 'bakery' : 'street', ['push', 'pull', 'truck', 'crane', 'fly', 'face'][i % 6], i % 5 ? null : 'oven']), 1.2);
  const p = checkVariety(shots);
  assert.ok(p.some(x => /only 2 different scenes/.test(x)), p.join('\n'));
});
test('variety: a varied storyboard passes', () => {
  const sets = ['shopfront', 'bench', 'desk', 'clock', 'calendar', 'queue', 'promise', 'talk', 'finale', 'street'];
  const cams = ['push', 'pull', 'truck', 'crane', 'fly', 'orbit', 'whip', 'tiltup', 'vertigo', 'spiral'];
  assert.deepEqual(checkVariety(mk(sets.map((s, i) => [s, cams[i]]), 3.5)), []);
});
test('variety: the same scene and camera twice within four shots is flagged by shot id', () => {
  const sets = ['shopfront', 'bench', 'desk', 'clock', 'calendar', 'queue', 'promise', 'talk'];
  const shots = mk(sets.map((s, i) => [s, ['push', 'pull', 'truck', 'crane', 'fly', 'orbit', 'whip', 'tiltup'][i]]), 4);
  shots[3] = { ...shots[3], set: 'bench', cam: 'pull' };   // same set+cam as shot-2, two shots later
  assert.ok(checkVariety(shots).some(x => /shot-2.*shot-4.*same scene and camera/.test(x)));
});
test('variety: the camera must change between consecutive shots, and one scene may not take over the film', () => {
  const same = mk([['bench', 'push'], ['desk', 'push'], ['clock', 'pull'], ['queue', 'fly'], ['talk', 'orbit'], ['finale', 'whip']], 5);
  assert.ok(checkVariety(same).some(x => /shot-1 and shot-2 use the same camera "push"/.test(x)));
  const hog = mk(Array.from({ length: 10 }, (_, i) => [i < 6 ? 'bench' : ['desk', 'clock', 'queue', 'talk'][i - 6], ['push', 'pull', 'truck', 'crane', 'fly', 'orbit', 'whip', 'tiltup', 'vertigo', 'spiral'][i]]), 3);
  assert.ok(checkVariety(hog).some(x => /"bench" fills 60% of the shots/.test(x)));
});
test('variety: a short film is not held to the scene count (a 6 s test film passes)', () => {
  assert.deepEqual(checkVariety(mk([['bakery', 'push'], ['street', 'pull']], 3)), []);
});
