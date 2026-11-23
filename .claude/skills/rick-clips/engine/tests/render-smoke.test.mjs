import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// Browser-only page code (planes, camera, transitions) cannot be unit-tested, and a bad edit once rendered blank paper in every frame
// while all unit tests stayed green. This renders real frames and checks they are not mostly blank paper.
const MIN_SATURATION = 17;   // top half of a real sketch frame measures >= 19.5; plain paper measures ~14.5
const topHalfSaturation = file => {
  const r = spawnSync('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'crop=iw:ih*0.55:0:0,signalstats,metadata=print:key=lavfi.signalstats.SATAVG:file=-', '-frames:v', '1', '-f', 'null', '-'], { encoding: 'utf8' });
  return +/SATAVG=([\d.]+)/.exec(r.stdout + r.stderr)[1];
};
const LIB = process.env.LEMO_OPUSCAR_HOME, FILM = new URL('../films/brandwake-sketch', import.meta.url).pathname;

test('smoke: the detector flags a saved blank-paper frame (it can fail)', () => {
  assert.ok(topHalfSaturation(new URL('./fixtures/blank-paper.jpg', import.meta.url).pathname) < MIN_SATURATION);
});

test('smoke: real sketch frames are not blank paper in portrait and landscape', { skip: !LIB || !existsSync(join(FILM, 'timeline.json')) ? 'needs LEMO_OPUSCAR_HOME and the built film' : false }, () => {
  for (const size of ['1080x1920', '1920x1080']) {
    const out = mkdtempSync(join(tmpdir(), 'smoke-'));
    const r = spawnSync('node', ['core/render/still.mjs', FILM, '6', '17', '24', '--size', size, '--out', out], { cwd: LIB, encoding: 'utf8', env: { ...process.env, LEMO_ANGLE: 'swiftshader' } });
    assert.equal(r.status, 0, r.stdout + r.stderr);
    for (const t of ['6', '17', '24']) assert.ok(topHalfSaturation(join(out, `t_${t}.jpg`)) >= MIN_SATURATION, `${size} t=${t} looks like blank paper`);
  }
});
