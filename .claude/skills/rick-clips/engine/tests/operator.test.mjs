import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fbm, springFollow, easeSettle } from '../core/camnoise.js';
import { sketchCam, SKETCH_CAM_NAMES, SHOT_SIZE } from '../core/sketchcams.js';
import { checkVariety } from '../core/variety.js';
import { layerTransform } from '../core/layers.js';

const SIZE = { W: 1080, H: 1920 };

test('operator: handheld noise is deterministic, bounded, smooth, and differs per seed (not a sine)', () => {
  assert.equal(fbm(1.234, 3), fbm(1.234, 3));
  assert.notEqual(fbm(1.234, 3), fbm(1.234, 4));
  let max = 0, jump = 0, prev = fbm(0, 1);
  for (let t = 0.01; t < 20; t += 0.01) { const v = fbm(t, 1); max = Math.max(max, Math.abs(v)); jump = Math.max(jump, Math.abs(v - prev)); prev = v; }
  assert.ok(max <= 1.0001, `bounded ${max}`); assert.ok(jump < 0.08, `smooth ${jump}`);
  const period = [...Array(40)].map((_, i) => fbm(i * 0.5, 2)); assert.ok(new Set(period.map(v => v.toFixed(3))).size > 30, 'aperiodic');
});
test('operator: a camera that follows lags behind a moving subject, then settles on it without overshoot', () => {
  const target = t => (t < 0.5 ? 0 : 300), f = t => springFollow(target, 0, t, { freq: 3 });
  assert.equal(f(0.4), 0);
  assert.ok(f(0.6) > 0 && f(0.6) < 150, `lags ${f(0.6)}`);
  assert.ok(f(2.5) > 285 && f(2.5) <= 300.0001, `settles ${f(2.5)}`);
  for (let t = 0.5; t < 3; t += 0.05) assert.ok(f(t) <= 300.0001, 'critically damped: never overshoots');
});
test('operator: easeSettle accelerates, overshoots a little, and lands exactly on 1', () => {
  assert.equal(easeSettle(0), 0); assert.equal(easeSettle(1), 1);
  let max = 0; for (let u = 0; u <= 1; u += 0.01) max = Math.max(max, easeSettle(u));
  assert.ok(max > 1.005 && max < 1.08, `overshoot ${max}`);
  assert.ok(easeSettle(0.1) < 0.1, 'starts slowly');
});
test('operator: the professional moves exist and really move (crash zoom, steadicam drift, reveal, tracking, extreme close-up)', () => {
  for (const n of ['crash', 'drift', 'reveal', 'follow', 'ecu']) assert.ok(SKETCH_CAM_NAMES.includes(n), n);
  const subject = { u: 0, v: -250, depth: 0.65 }, f = n => sketchCam(n, { t0: 0, t1: 1.4, subject, size: SIZE });
  assert.ok(f('crash')(0.3).zoom - f('crash')(0).zoom > 0.5, 'crash zoom is fast');
  assert.ok(f('crash')(1.4).zoom - f('crash')(0.4).zoom < 0.5, '...then settles slowly');
  assert.ok(f('ecu')(0).zoom >= 3, 'extreme close-up');
  assert.ok(f('reveal')(0).focus > 0.9 && f('reveal')(1.4).focus === 0.65, 'reveal pulls focus from the foreground onto the subject');
});
test('operator: follow tracks a MOVING subject with lag (subject may be a function of time)', () => {
  const moving = t => ({ u: t < 0.4 ? -300 : 300, v: -250, depth: 0.65 }), cam = sketchCam('follow', { t0: 0, t1: 3, subject: moving, size: SIZE });
  const px = t => { const c = cam(t), tr = layerTransform(0.65, c); return tr.dx + tr.scale * moving(t).u; };   // where the subject lands on screen
  assert.ok(Math.abs(px(0.5)) > 100, 'right after the subject moves it is off-centre: the camera lags');
  assert.ok(Math.abs(px(2.9)) < 90, 'later the camera has caught up');
});
test('operator: every camera has a shot size, and the lint wants wide, medium and close shots, not four of one size in a row', () => {
  for (const n of SKETCH_CAM_NAMES) assert.ok(['wide', 'medium', 'close', 'extreme'].includes(SHOT_SIZE[n]), n);
  const mk = list => list.map((cam, i) => ({ id: `shot-${i + 1}`, set: ['a', 'b', 'c', 'd', 'e', 'f', 'g'][i % 7], cam, look: null, t0: i * 3, t1: (i + 1) * 3 }));
  const flat = mk(['push', 'truck', 'orbit', 'pull', 'follow', 'drift', 'reveal']);   // all medium
  const p = checkVariety(flat, { sizeOf: c => SHOT_SIZE[c] });
  assert.ok(p.some(x => /only 1 shot size/.test(x)), p.join('\n'));
  assert.ok(p.some(x => /4 shots in a row/.test(x)), p.join('\n'));
  const mixed = mk(['wide', 'push', 'face', 'truck', 'ecu', 'orbit', 'crane']);
  assert.deepEqual(checkVariety(mixed, { sizeOf: c => SHOT_SIZE[c] }), []);
});

test('sharpness: short shots (about a second) start in focus; only long shots pull focus from soft', () => {
  const subject = { u: 0, v: -250, depth: 0.65 }, f = (n, dur) => sketchCam(n, { t0: 0, t1: dur, subject, size: SIZE })(0).focus;
  for (const n of ['push', 'face', 'low', 'dutch', 'ecu']) {
    assert.ok(0.65 - f(n, 1.0) <= 0.1, `${n} on a 1 s shot starts at most slightly soft`);
    assert.ok(0.65 - f(n, 3.0) >= 0.3, `${n} on a 3 s shot still racks from soft`);
  }
});
test('sharpness: the whip camera adds only a light streak (<= 6 px), not a heavy blur', () => {
  const f = sketchCam('whip', { t0: 0, t1: 1.4, subject: { u: 0, v: 0, depth: 0.65 }, size: SIZE });
  let max = 0; for (let t = 0; t <= 1.4; t += 0.05) max = Math.max(max, f(t).blur);
  assert.ok(max > 0 && max <= 6, `max ${max}`);
});
