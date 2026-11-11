// Perf sanity for a full stack: 8 video layers + 8 audio tracks open, render, scrub and export in sane time.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { importFiles, open, tone, trackErrors, withAudio } from './helpers';
import { importPaths, openHarness } from './harness-helpers';
import { defaultClipAudio } from '../../src/core/model';
import type { MediaRef, Project, Track } from '../../src/core/model';

test.setTimeout(240_000);

const LAYERS = 8;

/** 8 video layers each holding a 1 s with-audio.mp4 clip at 25 % (spread over the frame), 8 audio tracks of tone. */
function stack(p: Pick<Project, 'format'>, video: MediaRef, audio: MediaRef): Project {
  const flags = { hidden: false, muted: false, solo: false, locked: false, name: '', volume: 1, duck: null };
  const clip = (id: string, m: MediaRef, i: number) => ({
    id,
    mediaId: m.id,
    kind: m.kind as 'video' | 'audio' | 'image',
    start: 0,
    in: (i * 0.2) % 2,
    out: ((i * 0.2) % 2) + 1,
    volume: 0.2,
    audio: defaultClipAudio(), effects: [], blend: 'normal' as const,
    fit: 'fit' as const,
    transform: { x: ((i % 4) - 1.5) * 400, y: (Math.floor(i / 4) - 0.5) * 400, scale: 0.5, rotation: 0, opacity: 1 },
  });
  const tracks: Track[] = [
    ...Array.from({ length: LAYERS }, (_, i) => ({ ...flags, id: `v${i}`, kind: 'video' as const, clips: [clip(`vc${i}`, video, i)] })),
    ...Array.from({ length: LAYERS }, (_, i) => ({ ...flags, id: `a${i}`, kind: 'audio' as const, clips: [{ ...clip(`ac${i}`, audio, i), in: 0, out: 1 }] })),
  ];
  return { version: 4, format: { ...p.format }, tracks, media: { [video.id]: video, [audio.id]: audio } };
}

async function renderedWithin(page: Page, t: number, ms: number): Promise<void> {
  const t0 = Date.now();
  await page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
  const canvas = page.getByTestId('preview-canvas');
  await expect
    .poll(async () => {
      const [state, renderedT] = await Promise.all([canvas.getAttribute('data-render-state'), canvas.getAttribute('data-rendered-t')]);
      return state === 'idle' && Math.abs(Number(renderedT) - t) < 0.005;
    }, { timeout: ms, intervals: [50] })
    .toBe(true);
  expect(Date.now() - t0, `preview frame at ${t}`).toBeLessThan(ms);
}

test('8 video layers + 8 audio tracks: the editor opens, renders a frame < 5 s and scrubs without errors', async ({ page }) => {
  const errors = trackErrors(page);
  await open(page);
  await importFiles(page, [withAudio, tone], 2);
  const { format, media } = await page.evaluate(() => window.__clipforge!.getState().history.present);
  const v = Object.values(media).find((m) => m.kind === 'video')!;
  const a = Object.values(media).find((m) => m.kind === 'audio')!;
  await page.evaluate((p) => window.__clipforge!.getState().loadProject(p), stack({ format }, v, a));
  await expect(page.getByTestId('track-header')).toHaveCount(2 * LAYERS);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2 * LAYERS);
  await renderedWithin(page, 0.5, 5000);
  for (const t of [0.1, 0.9, 0.3, 0.7]) await renderedWithin(page, t, 5000);
  const s = await page.evaluate(() => window.__clipforge!.videoSourceStats());
  expect(s.open).toBeLessThanOrEqual(LAYERS + 2);
  expect(errors).toEqual([]);
});

test('8 video layers + 8 audio tracks export a 1 s clip in under 60 s', async ({ page }) => {
  await openHarness(page);
  const [v, a] = await importPaths(page, [withAudio, tone]);
  const p = stack({ format: { width: 1920, height: 1080, fps: 30 } }, v, a);
  const t0 = Date.now();
  const r = await page.evaluate((p) => window.cf.runExport(p, { maxLongSide: 320 }), p);
  const ms = Date.now() - t0;
  expect(r.error).toBeNull();
  expect(ms).toBeLessThan(60_000);
  expect(Math.abs((r.info?.duration ?? 0) - 1)).toBeLessThanOrEqual(0.1);
  expect(r.info?.width).toBe(320);
  expect(r.info?.audioCodec).not.toBeNull();
  expect(r.info?.audioPeak ?? 0).toBeGreaterThan(0.05);
  test.info().annotations.push({ type: 'export-ms', description: String(ms) });
});
