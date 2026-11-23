import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CHECK = new URL('../skill/stickset/scripts/check-video.sh', import.meta.url).pathname;
const dir = mkdtempSync(join(tmpdir(), 'cv-'));
const make = (name, src) => {
  const f = join(dir, name);
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'lavfi', '-i', src, '-t', '2', '-pix_fmt', 'yuv420p', f]);
  assert.equal(r.status, 0, String(r.stderr));
  return f;
};
const run = (f, w, h, fps, dur) => spawnSync('sh', [CHECK, f, String(w), String(h), String(fps), String(dur)], { encoding: 'utf8' });

test('check-video: passes a correct clip', () => {
  const f = make('ok.mp4', 'testsrc=size=320x240:rate=30');
  const r = run(f, 320, 240, 30, 2);
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
test('check-video: fails on wrong dimensions', () => {
  const f = make('dim.mp4', 'testsrc=size=320x240:rate=30');
  const r = run(f, 640, 480, 30, 2);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /FAIL: size/);
});
test('check-video: fails on black frames', () => {
  const f = make('black.mp4', 'color=c=black:size=320x240:rate=30');
  const r = run(f, 320, 240, 30, 2);
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /FAIL: black/);
});
