import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const SRC = new URL('../skill', import.meta.url).pathname;
function sandbox() {
  const root = mkdtempSync(join(tmpdir(), 'ss-'));
  cpSync(SRC, join(root, 'skill'), { recursive: true });
  return root;
}
const ready = (root, ch) => {
  const p = join(root, 'skill/stickset/profiles', `${ch}.md`);
  writeFileSync(p, readFileSync(p, 'utf8').replace('STATUS: UNFILLED', 'STATUS: READY').replace('- What the channel is about / audience:', '- What the channel is about / audience: test brief'));
};
const STUB = '# Channel profile: X\nSTATUS: UNFILLED\ndefault_format: short\nvoice: bm_george\nspeed: 0.95\n\n## Brief\n- What the channel is about / audience:\n- Tone of voice:\n';
const blank = root => writeFileSync(join(root, 'skill/stickset/profiles/pride-parables.md'), STUB);
const run = (root, ...args) => spawnSync('sh', [join(root, 'skill/stickset/scripts/new-film.sh'), ...args], { encoding: 'utf8' });

test('new-film refuses an unfilled channel profile with "profile needs a brief"', () => {
  const root = sandbox(); blank(root);
  const r = run(root, 'demo', '--channel', 'pride-parables', '--format', 'short');
  assert.notEqual(r.status, 0);
  assert.match(r.stdout + r.stderr, /profile needs a brief/);
});
test('new-film scaffolds a short film at 1080x1920 @30', () => {
  const root = sandbox(); ready(root, 'brandwake');
  const r = run(root, 'demo', '--channel', 'brandwake', '--format', 'short');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dir = join(root, 'films/demo');
  for (const f of ['script.md', 'build.sh', 'index.html', 'metadata.md', 'mix.py', 'prepare.mjs', 'make-lines.mjs']) assert.ok(existsSync(join(dir, f)), f);
  const b = readFileSync(join(dir, 'build.sh'), 'utf8');
  assert.match(b, /1080x1920/); assert.match(b, /--fps 30/);
});
test('new-film scaffolds a long film at 1920x1080 @24 using chapters', () => {
  const root = sandbox(); ready(root, 'pride-parables');
  const r = run(root, 'demo', '--channel', 'pride-parables', '--format', 'long');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const b = readFileSync(join(root, 'films/demo/build.sh'), 'utf8');
  assert.match(b, /1920x1080/); assert.match(b, /render-chapters\.sh/); assert.match(b, /24/);
});
test('new-film rejects unknown channel and format, and never overwrites an existing film', () => {
  const root = sandbox(); ready(root, 'brandwake');
  assert.match(run(root, 'x', '--channel', 'nope', '--format', 'short').stdout + run(root, 'x', '--channel', 'nope', '--format', 'short').stderr, /unknown channel "nope".*brandwake.*pride-parables/s);
  assert.match(run(root, 'x', '--channel', 'brandwake', '--format', 'wide').stderr + run(root, 'x', '--channel', 'brandwake', '--format', 'wide').stdout, /unknown format "wide"/);
  assert.equal(run(root, 'demo', '--channel', 'brandwake', '--format', 'short').status, 0);
  const again = run(root, 'demo', '--channel', 'brandwake', '--format', 'short');
  assert.notEqual(again.status, 0);
  assert.match(again.stdout + again.stderr, /already exists/);
});
test('SKILL.md has name and description front matter and mentions the render budget rule', () => {
  const s = readFileSync(join(SRC, 'stickset/ENGINE.md'), 'utf8');
  assert.match(s, /^---\nname: stickset\ndescription: .{40,}\n---/);
  assert.match(s, /2 hours/);
});

test('new-film refuses an empty profile, a missing STATUS line, lower-case status, and READY with every brief answer blank', () => {
  for (const [label, mutate] of [
    ['empty file', () => ''],
    ['no STATUS line', t => t.replace(/^STATUS: .*\n/m, '')],
    ['lower-case status', t => t.replace('STATUS: UNFILLED', 'STATUS: unfilled')],
    ['READY but blank brief', t => t.replace('STATUS: UNFILLED', 'STATUS: READY')],
  ]) {
    const root = sandbox(); blank(root); const p = join(root, 'skill/stickset/profiles/pride-parables.md');
    writeFileSync(p, mutate(readFileSync(p, 'utf8')));
    const r = run(root, 'demo', '--channel', 'pride-parables', '--format', 'short');
    assert.notEqual(r.status, 0, label);
    assert.match(r.stdout + r.stderr, /profile needs a brief/, label);
  }
});

test('new-film --style sketch scaffolds the sketchbook page, a sketch script and sketch prepare', () => {
  const root = sandbox(); ready(root, 'brandwake');
  const r = run(root, 'demo', '--channel', 'brandwake', '--format', 'short', '--style', 'sketch');
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const dir = join(root, 'films/demo');
  assert.match(readFileSync(join(dir, 'index.html'), 'utf8'), /createRenderer/);
  assert.match(readFileSync(join(dir, 'script.md'), 'utf8'), /cast=rosa/);
  assert.match(readFileSync(join(dir, 'prepare.mjs'), 'utf8'), /style: 'sketch'/);
});
test('new-film: the default style stays classic, and an unknown style is rejected with the valid ones', () => {
  const root = sandbox(); ready(root, 'brandwake');
  assert.equal(run(root, 'a', '--channel', 'brandwake', '--format', 'short').status, 0);
  assert.doesNotMatch(readFileSync(join(root, 'films/a/index.html'), 'utf8'), /createRenderer/);
  const bad = run(root, 'b', '--channel', 'brandwake', '--format', 'short', '--style', 'neon');
  assert.notEqual(bad.status, 0); assert.match(bad.stdout + bad.stderr, /unknown style "neon" \(use classic, sketch\)/);
});

import { symlinkSync } from 'node:fs';
test('a scaffolded sketch film can run its voice-line step on a script that uses sketch transitions', () => {
  const root = sandbox(); ready(root, 'brandwake');
  symlinkSync(new URL('../core', import.meta.url).pathname, join(root, 'core'));   // films/<name>/stickset -> ../../core
  assert.equal(run(root, 'demo', '--channel', 'brandwake', '--format', 'short', '--style', 'sketch').status, 0);
  const dir = join(root, 'films/demo');
  writeFileSync(join(dir, 'script.md'), '[set=bakery cam=wide cast=rosa]\nHello there.\n\n[set=bakery cam=face face=smug cast=rosa cut=ink]\nSecond line.\n');
  const r = spawnSync('node', [join(dir, 'make-lines.mjs'), join(dir, 'script.md'), join(dir, 'lines.json')], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.equal(JSON.parse(readFileSync(join(dir, 'lines.json'), 'utf8')).length, 2);
});

test('a sketch scaffold passes its style to the render estimate (sketch renders are slower)', () => {
  const root = sandbox(); ready(root, 'brandwake');
  run(root, 'demo', '--channel', 'brandwake', '--format', 'short', '--style', 'sketch');
  assert.match(readFileSync(join(root, 'films/demo/build.sh'), 'utf8'), /estimate-cli\.mjs" "\$HERE" 30 \$SIZE sketch/);
  run(root, 'c', '--channel', 'brandwake', '--format', 'short');
  assert.match(readFileSync(join(root, 'films/c/build.sh'), 'utf8'), /estimate-cli\.mjs" "\$HERE" 30 \$SIZE classic/);
});

test('new-film works from ANY project folder: it links the engine core next to the films (relocatable skill)', () => {
  const root = sandbox(); ready(root, 'brandwake');
  const project = mkdtempSync(join(tmpdir(), 'proj-'));
  const r = spawnSync('sh', [join(root, 'skill/stickset/scripts/new-film.sh'), 'demo', '--channel', 'brandwake', '--format', 'short', '--style', 'sketch'], { encoding: 'utf8', env: { ...process.env, STICKSET_ROOT: project } });
  assert.equal(r.status, 1, 'no engine core anywhere: it must refuse with a clear message, not scaffold a broken film');
  assert.match(r.stdout + r.stderr, /engine core not found/);
  symlinkSync(new URL('../core', import.meta.url).pathname, join(root, 'core'));
  const r2 = spawnSync('sh', [join(root, 'skill/stickset/scripts/new-film.sh'), 'demo', '--channel', 'brandwake', '--format', 'short', '--style', 'sketch'], { encoding: 'utf8', env: { ...process.env, STICKSET_ROOT: project } });
  assert.equal(r2.status, 0, r2.stdout + r2.stderr);
  assert.ok(existsSync(join(project, 'core/sketchscene.js')), 'project/core links to the engine core');
  assert.ok(existsSync(join(project, 'films/demo/stickset/sketchscene.js')), 'the film reaches the core through its symlink');
});
test('a generic profile ships, so any topic can start without channel set-up', () => {
  const root = sandbox();
  const r = run(root, 'demo', '--channel', 'general', '--format', 'short', '--style', 'sketch');
  assert.equal(r.status, 0, r.stdout + r.stderr);
});
