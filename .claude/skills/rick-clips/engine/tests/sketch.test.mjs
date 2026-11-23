import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jitterPath, ellipsePts, rng } from '../core/sketch.js';
import { layerTransform, depthBlur } from '../core/layers.js';

test('sketch: rng is deterministic per seed and differs between seeds', () => {
  const a = rng(5), b = rng(5), c = rng(6);
  assert.equal(a(), b());
  assert.notEqual(rng(5)(), c());
});
test('sketch: jitterPath is deterministic, bounded by amp, and keeps the first point near the start', () => {
  const pts = [[0, 0], [100, 0], [200, 0]];
  const a = jitterPath(pts, { seed: 3, amp: 2, step: 10 }), b = jitterPath(pts, { seed: 3, amp: 2, step: 10 });
  assert.deepEqual(a, b);
  for (const [, y] of a) assert.ok(Math.abs(y) <= 2 + 1e-9, `y ${y}`);
  assert.ok(Math.hypot(a[0][0], a[0][1]) <= 2 + 1e-9);
  assert.ok(a.length > pts.length, 'resampled finer than the input');
});
test('sketch: a different seed gives a different wobble (so repeated passes do not coincide)', () => {
  const pts = [[0, 0], [200, 0]];
  assert.notDeepEqual(jitterPath(pts, { seed: 1, amp: 2 }), jitterPath(pts, { seed: 2, amp: 2 }));
});
test('sketch: ellipsePts closes on itself with n+1 points on the ellipse', () => {
  const p = ellipsePts(10, 20, 5, 3, 16);
  assert.equal(p.length, 17);
  assert.deepEqual(p[0].map(v => Math.round(v * 1e6) / 1e6), p[16].map(v => Math.round(v * 1e6) / 1e6));
  for (const [x, y] of p) assert.ok(Math.abs(((x - 10) / 5) ** 2 + ((y - 20) / 3) ** 2 - 1) < 1e-9);
});

test('layers: nearer layers move more than far layers when the camera trucks (parallax)', () => {
  const cam = { x: 100, y: 0, zoom: 1 };
  const far = layerTransform(0, cam), near = layerTransform(1, cam);
  assert.ok(Math.abs(near.dx) > Math.abs(far.dx));
  assert.ok(far.dx < 0 && near.dx < 0, 'camera moving right shifts the picture left');
});
test('layers: zoom 1 leaves every layer unscaled; push-in scales near layers more than far', () => {
  assert.equal(layerTransform(0.5, { x: 0, y: 0, zoom: 1 }).scale, 1);
  const c = { x: 0, y: 0, zoom: 1.4 };
  assert.ok(layerTransform(1, c).scale > layerTransform(0, c).scale);
  assert.ok(layerTransform(0, c).scale > 1);
});
test('layers: depth blur is zero at the focus layer and grows with distance from it', () => {
  assert.equal(depthBlur(0.5, 0.5, 20), 0);
  assert.ok(depthBlur(1, 0.5, 20) > 0);
  assert.ok(depthBlur(0, 0.5, 20) > 0);
  assert.ok(depthBlur(1, 0, 20) > depthBlur(0.5, 0, 20));
});

import { aimCamera } from '../core/layers.js';
import { sketchCam, SKETCH_CAM_NAMES } from '../core/sketchcams.js';
const SIZE = { W: 1080, H: 1920 };
test('layers: aimCamera puts the subject point at frame centre for any depth and zoom', () => {
  for (const depth of [0.35, 0.65, 1]) for (const zoom of [1, 1.6, 2.2]) {
    const subj = { u: 120, v: -310 }, cam = aimCamera(subj, zoom, depth), t = layerTransform(depth, cam);
    assert.ok(Math.abs(t.dx + t.scale * subj.u) < 1e-6 && Math.abs(t.dy + t.scale * subj.v) < 1e-6, `depth ${depth} zoom ${zoom}`);
  }
});
test('sketchcams: every name resolves; wide starts unzoomed; face ends tight with the subject centred and in focus', () => {
  const subject = { u: 60, v: -250, depth: 0.65 };
  for (const n of SKETCH_CAM_NAMES) { const f = sketchCam(n, { t0: 0, t1: 2, subject, size: SIZE }); assert.ok(f(1).zoom >= 1, n); }
  assert.equal(sketchCam('wide', { t0: 0, t1: 2, subject, size: SIZE })(0).zoom, 1);
  const end = sketchCam('face', { t0: 0, t1: 2, subject, size: SIZE })(2), t = layerTransform(0.65, end);
  assert.ok(end.zoom >= 1.8); assert.equal(end.focus, 0.65);
  assert.ok(Math.abs(t.dx + t.scale * subject.u) < 1e-6 && Math.abs(t.dy + t.scale * subject.v) < 1e-6);
});
test('sketchcams: high looks down (scene moves up), low looks up; unknown name lists the valid ones', () => {
  const subject = { u: 0, v: 0, depth: 0.65 };
  assert.ok(sketchCam('high', { t0: 0, t1: 2, subject, size: SIZE })(1).y > 0);
  assert.ok(sketchCam('low', { t0: 0, t1: 2, subject, size: SIZE })(1).y < 0);
  assert.throws(() => sketchCam('dolly', { t0: 0, t1: 1, subject, size: SIZE }), new RegExp('unknown cam "dolly" \\(use ' + SKETCH_CAM_NAMES.join(', ') + '\\)'));
});

test('sketchcams: close-ups rack focus (start soft, pull to the subject); wide holds focus', () => {
  const subject = { u: 0, v: -200, depth: 0.65 }, f = n => sketchCam(n, { t0: 0, t1: 2, subject, size: SIZE });
  for (const n of ['face', 'push', 'low']) { assert.ok(f(n)(0).focus < 0.65 - 0.2, `${n} starts soft`); assert.equal(f(n)(2).focus, 0.65, `${n} ends on the subject`); }
  assert.equal(f('wide')(0).focus, 0.65); assert.equal(f('high')(1).focus, 0.65);
});

test('sketchcams: every camera really moves (zoom, travel or roll) over a 1.4 s shot, and stays finite', () => {
  const subject = { u: 40, v: -260, depth: 0.65 };
  for (const n of SKETCH_CAM_NAMES) {
    const f = sketchCam(n, { t0: 0, t1: 1.4, subject, size: SIZE }), a = f(0), b = f(1.4);
    for (const v of [a.x, a.y, a.zoom, a.roll, b.x, b.y, b.zoom, b.roll]) assert.ok(Number.isFinite(v), `${n} finite`);
    const motion = Math.abs(b.zoom - a.zoom) * 0.5 * SIZE.H + Math.hypot(b.x - a.x, b.y - a.y) + Math.abs(b.roll - a.roll) * 0.5 * SIZE.H;
    assert.ok(motion >= 0.1 * SIZE.W, `${n} moves only ${motion.toFixed(0)} px`);
  }
});
test('sketchcams: the cinematic set is available (pull, truck, crane, fly, dutch) and dutch rolls', () => {
  for (const n of ['pull', 'truck', 'crane', 'fly', 'dutch']) assert.ok(SKETCH_CAM_NAMES.includes(n), n);
  const f = sketchCam('dutch', { t0: 0, t1: 1.4, subject: { u: 0, v: 0, depth: 0.65 }, size: SIZE });
  assert.notEqual(f(0).roll, f(1.4).roll);
});

test('layers: aimCamera can put the subject on a rule-of-thirds point instead of the centre', () => {
  const subj = { u: 80, v: -200 }, cam = aimCamera(subj, 1.8, 0.65, { ox: -250, oy: 120 }), t = layerTransform(0.65, cam);
  assert.ok(Math.abs(t.dx + t.scale * subj.u - -250) < 1e-6 && Math.abs(t.dy + t.scale * subj.v - 120) < 1e-6);
});
test('layers: a dolly-zoom (vertigo) grows the far planes relative to the near ones', () => {
  const plain = { x: 0, y: 0, zoom: 1.3 }, vert = { ...plain, vertigo: 0.5 };
  assert.ok(layerTransform(0, vert).scale / layerTransform(1, vert).scale > layerTransform(0, plain).scale / layerTransform(1, plain).scale);
});
test('sketchcams: the cinematic set has more than ten behaviours and frame= moves the subject off centre', () => {
  for (const n of ['orbit', 'vertigo', 'tiltup', 'spiral', 'whip']) assert.ok(SKETCH_CAM_NAMES.includes(n), n);
  const subject = { u: 0, v: -250, depth: 0.65 }, f = fr => sketchCam('face', { t0: 0, t1: 1.4, subject, size: SIZE, frame: fr })(1.4);
  const lt = layerTransform(0.65, f('left')), rt = layerTransform(0.65, f('right'));
  assert.ok(lt.dx + lt.scale * subject.u < -50 && rt.dx + rt.scale * subject.u > 50);
});
