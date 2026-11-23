import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const CLI = new URL('../core/estimate-cli.mjs', import.meta.url).pathname;
const run = (dur, size, fps = 24, style) => {
  const d = mkdtempSync(join(tmpdir(), 'ec-')); writeFileSync(join(d, 'timeline.json'), JSON.stringify({ DUR: dur }));
  return spawnSync('node', [CLI, d, String(fps), size, ...(style ? [style] : [])], { encoding: 'utf8' });
};
test('estimate-cli: exits 0 and prints the estimate for a normal film', () => {
  const r = run(34.7, '1080x1920', 30); assert.equal(r.status, 0); assert.match(r.stdout, /estimated render/);
});
test('estimate-cli: exits 3 with the 2 hour warning when the estimate is over budget', () => {
  const r = run(5000, '1920x1080'); assert.equal(r.status, 3); assert.match(r.stdout, /exceeds 2 hours/);
});
test('estimate-cli: a style argument makes the sketch estimate longer', () => {
  const m = r => +/about ([\d.]+) min/.exec(r.stdout)[1];
  assert.ok(m(run(300, '1920x1080', 24, 'sketch')) > m(run(300, '1920x1080', 24, 'classic')) * 1.4);
});
