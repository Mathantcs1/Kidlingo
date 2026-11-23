import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMATS } from '../core/formats.js';

test('formats: short is 1080x1920 at 30 fps', () => {
  assert.deepEqual(FORMATS.short, { w: 1080, h: 1920, fps: 30 });
});
test('formats: long is 1920x1080 at 24 fps', () => {
  assert.deepEqual(FORMATS.long, { w: 1920, h: 1080, fps: 24 });
});
