import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cameraFor, CAM_NAMES } from '../core/cams.js';

test('cams: every script camera name resolves to a move that starts at its t0 pose', () => {
  for (const name of CAM_NAMES) {
    const { cam, at } = cameraFor(name, 1, 3);
    assert.equal(cam(1).pos.length, 3, name);
    assert.equal(at.length, 3, name);
    assert.notDeepEqual(cam(1).pos, cam(3).pos, `${name} must move`);
  }
});
test('cams: face is closer than wide (subject fills more of the frame)', () => {
  assert.ok(cameraFor('face', 0, 1).cam(0).pos[2] < cameraFor('wide', 0, 1).cam(0).pos[2]);
});
test('cams: low looks up from below head height, high looks down from above', () => {
  assert.ok(cameraFor('low', 0, 1).cam(0).pos[1] < 1);
  assert.ok(cameraFor('high', 0, 1).cam(0).pos[1] > 3);
});
test('cams: an unknown camera name is a script error naming the valid ones', () => {
  assert.throws(() => cameraFor('dolly', 0, 1), /unknown cam "dolly".*wide/);
});

import { projectFrameY } from '../core/cams.js';
const HEAD_TOP = 2.32, CHIN = 1.60, ASPECT = 1080 / 1920;
test('cams: face close-up keeps the whole head in frame (>=4% margin) and the chin above the caption band, start to end', () => {
  const { cam, at } = cameraFor('face', 0, 2);
  for (const t of [0, 1, 2]) {
    const top = projectFrameY(cam(t), at, HEAD_TOP), chin = projectFrameY(cam(t), at, CHIN);
    assert.ok(top >= 0.04, `head top at ${top} (t=${t})`);
    assert.ok(chin <= 0.58, `chin at ${chin} (t=${t}) must stay above the caption band (60%)`);
  }
  void ASPECT;
});
