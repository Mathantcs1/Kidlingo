import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const DOCTOR = new URL('../skill/stickset/scripts/doctor.sh', import.meta.url).pathname;

function runWithFfmpeg(versionLine) {
  const dir = mkdtempSync(join(tmpdir(), 'doc-'));
  const stub = join(dir, 'ffmpeg');
  writeFileSync(stub, `#!/bin/sh\necho "${versionLine}"\n`);
  chmodSync(stub, 0o755);
  return spawnSync('sh', [DOCTOR], {
    env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    encoding: 'utf8',
  });
}

test('doctor reports old ffmpeg', () => {
  const r = runWithFfmpeg('ffmpeg version 6.1.1 Copyright');
  assert.notEqual(r.status, 0);
  assert.match(r.stdout, /MISSING: ffmpeg>=7/);
});

test('doctor accepts ffmpeg 7', () => {
  const r = runWithFfmpeg('ffmpeg version 7.0.2 Copyright');
  assert.match(r.stdout, /^LIB=/m, 'doctor must run and print LIB= as its last line');
  assert.doesNotMatch(r.stdout, /MISSING: ffmpeg>=7/);
});

test('doctor accepts a static git-master ffmpeg build (N-xxxxx version)', () => {
  const r = runWithFfmpeg('ffmpeg version N-71064-gd5e603ddc0-static https://johnvansickle.com/ffmpeg/');
  assert.match(r.stdout, /^LIB=/m);
  assert.doesNotMatch(r.stdout, /MISSING: ffmpeg>=7/);
});

import { mkdirSync, existsSync, readFileSync } from 'node:fs';
test('doctor --install clones the Lemo library when it is missing (relocatable skill), then reports its path', () => {
  const work = mkdtempSync(join(tmpdir(), 'dc-')), src = join(work, 'src'), lib = join(work, 'lib');
  mkdirSync(join(src, 'core/render'), { recursive: true });
  writeFileSync(join(src, 'AGENTS.md'), 'x'); writeFileSync(join(src, 'core/render/video.mjs'), '');
  const sh = (a, o = {}) => spawnSync('sh', ['-c', a], { cwd: src, encoding: 'utf8', ...o });
  assert.equal(sh('git init -q && git add -A && git -c user.email=a@b -c user.name=t commit -qm init').status, 0);
  const stubDir = mkdtempSync(join(tmpdir(), 'ff-')); writeFileSync(join(stubDir, 'ffmpeg'), '#!/bin/sh\necho "ffmpeg version 7.0 Copyright"\n'); chmodSync(join(stubDir, 'ffmpeg'), 0o755);
  const r = spawnSync('sh', [DOCTOR, '--install'], { encoding: 'utf8', env: { ...process.env, PATH: `${stubDir}:${process.env.PATH}`, LEMO_OPUSCAR_HOME: lib, LEMO_REPO: src, LEMO_SKIP_DEPS: '1' } });
  assert.ok(existsSync(join(lib, 'AGENTS.md')), r.stdout + r.stderr);
  assert.match(r.stdout, new RegExp(`^LIB=${lib}$`, 'm'));
  void readFileSync;
});
