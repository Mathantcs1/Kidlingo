// Video decoders are opened only for clips under the playhead and closed when they are done with, so long
// projects with many clips never pile up decoders, cached frames or textures.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { addToTimeline, importFiles, open } from './helpers';
import { clipOf, importPaths, openHarness, project } from './harness-helpers';
import type { Clip } from '../../src/core/model';

test.setTimeout(180_000);

const noAudio = join(ensureFixtures(), 'no-audio.mp4');
const N = 40;
// Binary-exact clip length and frame period, so every clip is under exactly one frame time.
const LEN = 0.125;

test(`exporting ${N} consecutive clips keeps at most one video source open at a time`, async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [noAudio]);
  const clips: Clip[] = Array.from({ length: N }, (_, i) =>
    clipOf(m, { start: i * LEN, in: (i * LEN) % 1.75, out: ((i * LEN) % 1.75) + LEN, transform: { scale: 0.25 } }),
  );
  const p = project({ width: 160, height: 90, fps: 8 }, [m], clips);
  await page.evaluate(() => window.cf.resetVideoSourceStats());
  const r = await page.evaluate((p) => window.cf.runExport(p, {}), p);
  expect(r.error).toBeNull();
  expect(Math.abs((r.info?.duration ?? 0) - N * LEN)).toBeLessThanOrEqual(0.1);
  const stats = await page.evaluate(() => window.cf.videoSourceStats());
  expect(stats.opened).toBe(N);
  expect(stats.peak).toBeLessThanOrEqual(1);
  expect(stats.open).toBe(0);
});

async function waitRendered(page: Page, t: number): Promise<void> {
  const canvas = page.getByTestId('preview-canvas');
  await expect
    .poll(async () => {
      const [state, renderedT] = await Promise.all([
        canvas.getAttribute('data-render-state'),
        canvas.getAttribute('data-rendered-t'),
      ]);
      return state === 'idle' && Math.abs(Number(renderedT) - t) < 0.005;
    })
    .toBe(true);
}

test('scrubbing the preview across many clips keeps only a few video sources open', async ({ page }) => {
  await open(page);
  await importFiles(page, [noAudio], 1);
  await addToTimeline(page, 'no-audio.mp4', 1);
  const count = 20;
  await page.evaluate((count) => {
    const { apply } = window.__clipforge!.getState();
    apply((p) => {
      const video = p.tracks.find((t) => t.kind === 'video')!;
      const base = video.clips[0];
      const clips = Array.from({ length: count }, (_, i) => ({ ...base, id: `c${i}`, start: i * 0.1, in: i * 0.1, out: i * 0.1 + 0.1 }));
      return { ...p, tracks: p.tracks.map((t) => (t.id === video.id ? { ...t, clips } : t)) };
    });
  }, count);
  const peak = { open: 0 };
  const scrub = async (i: number): Promise<void> => {
    const t = i * 0.1 + 0.05;
    await page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
    await waitRendered(page, t);
    const s = await page.evaluate(() => window.__clipforge!.videoSourceStats());
    peak.open = Math.max(peak.open, s.open);
  };
  for (let i = 0; i < count; i++) await scrub(i);
  for (let i = count - 1; i >= 0; i -= 3) await scrub(i);
  // The clip under the playhead plus the two most recently used ones.
  expect(peak.open).toBeLessThanOrEqual(3);
});
