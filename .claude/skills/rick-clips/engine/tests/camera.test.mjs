import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pushIn, flyThrough } from '../core/camera.js';

const A = { pos: [0, 0, 10], fov: 50 };
const B = { pos: [0, 0, 4], fov: 40 };

test('camera: pushIn clamps before t0 and after t1', () => {
  const cam = pushIn({ from: A, to: B, t0: 1, t1: 3 });
  assert.deepEqual(cam(0), A);
  assert.deepEqual(cam(9), B);
});

test('camera: pushIn midpoint is halfway with the default ease', () => {
  const cam = pushIn({ from: A, to: B, t0: 0, t1: 2 });
  const m = cam(1);
  assert.ok(Math.abs(m.pos[2] - 7) < 1e-9);
  assert.ok(Math.abs(m.fov - 45) < 1e-9);
});

test('camera: flyThrough clamps to first and last point and passes the middle point', () => {
  const pts = [{ pos: [0, -5, 0], fov: 50 }, { pos: [0, 0, 0], fov: 50 }, { pos: [0, 8, 0], fov: 50 }];
  const cam = flyThrough(pts, 0, 4);
  assert.deepEqual(cam(-1), pts[0]);
  assert.deepEqual(cam(99), pts[2]);
  assert.ok(Math.abs(cam(2).pos[1] - 0) < 1e-9);
});
