import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';

const dir = ensureFixtures();
const withAudio = join(dir, 'with-audio.mp4');
const noAudio = join(dir, 'no-audio.mp4');

async function openHarness(page: Page): Promise<void> {
  await page.goto('/harness.html');
  await page.waitForFunction(() => window.cf !== undefined);
}

/** Imports both fixtures and returns their media ids. */
async function importFixtures(page: Page): Promise<{ a: string; b: string }> {
  await page.setInputFiles('#harness-file', [withAudio, noAudio]);
  const a = (await page.evaluate(() => window.cf.importInputFile(0))).id;
  const b = (await page.evaluate(() => window.cf.importInputFile(1))).id;
  return { a, b };
}

test('frameAt returns frames at, before and beyond the source range', async ({ page }) => {
  await openHarness(page);
  const { a } = await importFixtures(page);
  const r = await page.evaluate(async (id) => {
    const src = await window.cf.openVideoSource(id);
    try {
      const mid = await src.frameAt(1.5);
      const midInfo =
        mid && ('displayWidth' in mid ? { w: mid.displayWidth, h: mid.displayHeight } : { w: mid.width, h: mid.height });
      const end = await src.frameAt(99);
      const endTs = end && 'timestamp' in end ? end.timestamp : null;
      const before = await src.frameAt(-1);
      const beforeTs = before && 'timestamp' in before ? before.timestamp : null;
      return { midInfo, endTs, beforeTs };
    } finally {
      src.close();
    }
  }, a);
  expect(r.midInfo).toEqual({ w: 640, h: 360 });
  expect(r.endTs).not.toBeNull();
  expect(r.endTs ?? 0).toBeGreaterThan(2_800_000);
  expect(r.beforeTs).not.toBeNull();
  expect(Math.abs(r.beforeTs ?? 1e9)).toBeLessThanOrEqual(1000);
});

test('sequential frameAt returns the exact frame for each n/fps, then seeks back', async ({ page }) => {
  await openHarness(page);
  const { a } = await importFixtures(page);
  const r = await page.evaluate(async (id) => {
    const ts = (f: VideoFrame | ImageBitmap | null): number | null =>
      f && 'timestamp' in f ? f.timestamp : null;
    const src = await window.cf.openVideoSource(id);
    try {
      const timestamps: (number | null)[] = [];
      let colourful = false;
      // All 90 frames: with this fixture's 1/15360 timebase, float error in `start + duration` first bites at k = 32.
      for (let i = 0; i < 90; i++) {
        const f = await src.frameAt(i / 30);
        timestamps.push(ts(f));
        if (i === 0 && f) {
          const canvas = document.createElement('canvas');
          canvas.width = 640;
          canvas.height = 360;
          const ctx = canvas.getContext('2d');
          if (!ctx) throw new Error('no 2d context');
          ctx.drawImage(f, 0, 0);
          const px = ctx.getImageData(0, 0, 640, 360).data;
          let max = 0;
          for (let p = 0; p < px.length; p += 4) max = Math.max(max, px[p], px[p + 1], px[p + 2]);
          colourful = max > 64;
        }
      }
      const forward = ts(await src.frameAt(2.0));
      const back = ts(await src.frameAt(0.5));
      // Overlapping calls are serialised and each gets its own frame.
      const both = await Promise.all([src.frameAt(0.1), src.frameAt(2.0)]);
      const overlapFirst = ts(both[0]);
      const overlapSecond = ts(both[1]);
      return { timestamps, colourful, forward, back, overlapFirst, overlapSecond };
    } finally {
      src.close();
    }
  }, a);
  expect(r.timestamps).toHaveLength(90);
  r.timestamps.forEach((t, i) => {
    expect(t, `frameAt(${i}/30)`).not.toBeNull();
    expect(Math.abs((t ?? 0) - (i / 30) * 1e6), `frameAt(${i}/30) timestamp ${t}`).toBeLessThanOrEqual(1000);
  });
  expect(r.colourful).toBe(true);
  expect(Math.abs((r.forward ?? 0) - 2_000_000)).toBeLessThanOrEqual(1000);
  expect(Math.abs((r.back ?? 0) - 500_000)).toBeLessThanOrEqual(1000);
  expect(Math.abs((r.overlapFirst ?? 0) - 100_000)).toBeLessThanOrEqual(1000);
  expect(Math.abs((r.overlapSecond ?? 0) - 2_000_000)).toBeLessThanOrEqual(1000);
});

test('two sources on the same media are independent; close is idempotent', async ({ page }) => {
  await openHarness(page);
  const { a } = await importFixtures(page);
  const r = await page.evaluate(async (id) => {
    const s1 = await window.cf.openVideoSource(id);
    const s2 = await window.cf.openVideoSource(id);
    const f1 = await s1.frameAt(0.5);
    const t1 = f1 && 'timestamp' in f1 ? f1.timestamp : null;
    const f2 = await s2.frameAt(2.5);
    const t2 = f2 && 'timestamp' in f2 ? f2.timestamp : null;
    // s1 still serves after s2 was used and closed.
    s2.close();
    const f1b = await s1.frameAt(0.6);
    const t1b = f1b && 'timestamp' in f1b ? f1b.timestamp : null;
    s1.close();
    s1.close();
    s2.close();
    return { t1, t2, t1b };
  }, a);
  expect(Math.abs((r.t1 ?? 0) - 500_000)).toBeLessThanOrEqual(34_000);
  expect(Math.abs((r.t2 ?? 0) - 2_500_000)).toBeLessThanOrEqual(34_000);
  expect(Math.abs((r.t1b ?? 0) - 600_000)).toBeLessThanOrEqual(34_000);
});

test('decodeAudio returns source-timeline ranges and null without audio', async ({ page }) => {
  await openHarness(page);
  const { a, b } = await importFixtures(page);
  const r = await page.evaluate(
    async ({ a, b }) => {
      const ctx = window.cf.newAudioContext();
      const one = await window.cf.decodeAudio(a, 0, 1, ctx);
      let peak = 0;
      if (one) {
        for (let c = 0; c < one.numberOfChannels; c++) {
          for (const s of one.getChannelData(c)) peak = Math.max(peak, Math.abs(s));
        }
      }
      const tail = await window.cf.decodeAudio(a, 2.5, 99, ctx);
      const outside = await window.cf.decodeAudio(a, 5, 6, ctx);
      const silent = await window.cf.decodeAudio(b, 0, 1, ctx);
      return {
        one: one && { length: one.length, rate: one.sampleRate, channels: one.numberOfChannels },
        peak,
        tail: tail && tail.duration,
        outside: outside === null,
        silent: silent === null,
      };
    },
    { a, b },
  );
  expect(r.one).not.toBeNull();
  const one = r.one ?? { length: 0, rate: 1, channels: 0 };
  expect(Math.abs(one.length - one.rate)).toBeLessThanOrEqual(one.rate * 0.05);
  expect([1, 2]).toContain(one.channels);
  expect(r.peak).toBeGreaterThan(0.05);
  expect(r.tail).not.toBeNull();
  expect(Math.abs((r.tail ?? 0) - 0.5)).toBeLessThanOrEqual(0.05);
  expect(r.outside).toBe(true);
  expect(r.silent).toBe(true);
});
