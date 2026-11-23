import { test } from 'node:test';
import assert from 'node:assert/strict';
import { estimateRenderSeconds, exceedsBudget } from '../core/estimate.js';

test('estimate: matches the measured sample (34.7 s @30 fps 1080x1920 took ~84 s) within 10 %', () => {
  const s = estimateRenderSeconds({ dur: 34.7, fps: 30, w: 1080, h: 1920 });
  assert.ok(Math.abs(s - 84) / 84 < 0.1, String(s));
});
test('estimate: a 8 min 1080p long-form final is about a quarter hour, well under 2 hours', () => {
  const s = estimateRenderSeconds({ dur: 480, fps: 24, w: 1920, h: 1080 });
  assert.ok(s > 600 && s < 1500, String(s));
  assert.equal(exceedsBudget(s), false);
});
test('estimate: an 80 min film exceeds the 2 hour budget; a draft at half size is 4x cheaper', () => {
  const full = estimateRenderSeconds({ dur: 4800, fps: 24, w: 1920, h: 1080 });
  assert.equal(exceedsBudget(full), true);
  const draft = estimateRenderSeconds({ dur: 4800, fps: 24, w: 960, h: 540 });
  assert.ok(Math.abs(full / draft - 4) < 0.01);
});

test('estimate: the sketch style is ~1.6x slower than classic per frame (measured once: 0.13 vs 0.081 s/frame)', () => {
  const base = { dur: 34.7, fps: 30, w: 1080, h: 1920 };
  const r = estimateRenderSeconds({ ...base, style: 'sketch' }) / estimateRenderSeconds(base);
  assert.ok(r > 1.5 && r < 1.7, String(r));
  assert.equal(estimateRenderSeconds({ ...base, style: 'classic' }), estimateRenderSeconds(base));
});
