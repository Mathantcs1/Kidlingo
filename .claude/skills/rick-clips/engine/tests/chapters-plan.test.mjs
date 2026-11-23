import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const PLAN = new URL('../skill/stickset/scripts/chapters-plan.mjs', import.meta.url).pathname;
function film(code) {
  const d = mkdtempSync(join(tmpdir(), 'cp-')); mkdirSync(join(d, 'stickset'));
  const shots = Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, t0: i * 4, t1: (i + 1) * 4, text: 't' }));
  writeFileSync(join(d, 'timeline.json'), JSON.stringify({ shots, words: [{ text: 'a', start: 1, end: 1.3 }] }));
  writeFileSync(join(d, 'index.html'), '<html>page</html>'); writeFileSync(join(d, 'stickset', 'rig.js'), code);
  return d;
}
const hashes = d => spawnSync('node', [PLAN, join(d, 'timeline.json'), '20', '40', 'cfg', '30'], { encoding: 'utf8' }).stdout;

test('chapters-plan: editing film code (page or core module) invalidates every chapter hash', () => {
  const d = film('export const a = 1;');
  const before = hashes(d);
  assert.match(before, /^chapter-01 /);
  writeFileSync(join(d, 'stickset', 'rig.js'), 'export const a = 2;');
  assert.notEqual(hashes(d), before);
  const d2 = film('export const a = 1;'); writeFileSync(join(d2, 'index.html'), '<html>changed</html>');
  assert.notEqual(hashes(d2), before);
});
test('chapters-plan: unchanged film gives identical hashes', () => {
  const d = film('export const a = 1;');
  assert.equal(hashes(d), hashes(d));
});
