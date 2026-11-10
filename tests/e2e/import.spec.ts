import { statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { MediaRef } from '../../src/core/model';
import { ensureFixtures } from './fixtures';

const dir = ensureFixtures();
const withAudio = join(dir, 'with-audio.mp4');
const noAudio = join(dir, 'no-audio.mp4');

async function openHarness(page: Page): Promise<void> {
  await page.goto('/harness.html');
  await page.waitForFunction(() => window.cf !== undefined);
}

test('imports MP4s with and without audio into OPFS', async ({ page }) => {
  await openHarness(page);
  await page.setInputFiles('#harness-file', [withAudio, noAudio]);

  const a: MediaRef = await page.evaluate(() => window.cf.importInputFile(0));
  expect(a.kind).toBe('video');
  expect(a.name).toBe('with-audio.mp4');
  expect(Math.abs(a.duration - 3)).toBeLessThanOrEqual(0.15);
  expect(a.width).toBe(640);
  expect(a.height).toBe(360);
  expect(a.hasAudio).toBe(true);
  expect(Math.abs((a.fps ?? 0) - 30)).toBeLessThanOrEqual(0.5);

  const b: MediaRef = await page.evaluate(() => window.cf.importInputFile(1));
  expect(b.kind).toBe('video');
  expect(Math.abs(b.duration - 2)).toBeLessThanOrEqual(0.15);
  expect(b.hasAudio).toBe(false);

  for (const [m, path] of [[a, withAudio], [b, noAudio]] as const) {
    const stored = await page.evaluate(async (id) => {
      const has = await window.cf.hasMedia(id);
      const f = await window.cf.getMediaFile(id);
      return { has, size: f.size };
    }, m.id);
    expect(stored.has).toBe(true);
    expect(stored.size).toBe(statSync(path).size);
  }
});

test('rejects a non-media file and leaves OPFS untouched', async ({ page }) => {
  await openHarness(page);
  await page.setInputFiles('#harness-file', noAudio);
  await page.evaluate(() => window.cf.importInputFile(0));
  const before = await page.evaluate(() => window.cf.listMediaIds());
  expect(before).toHaveLength(1);
  await page.setInputFiles('#harness-file', {
    name: 'not-a-video.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('this is just some text, not a video\n'.repeat(20)),
  });
  const err = await page.evaluate(async () => {
    try {
      await window.cf.importInputFile(0);
      return null;
    } catch (e) {
      return { name: (e as Error).name, message: (e as Error).message };
    }
  });
  expect(err).not.toBeNull();
  expect(err?.name).toBe('ImportError');
  expect(err?.message).toMatch(/Unsupported file type/);
  expect(await page.evaluate(() => window.cf.listMediaIds())).toEqual(before);
});
