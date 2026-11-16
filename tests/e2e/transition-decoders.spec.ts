// Plan 5C Task 4: during a transition window the export holds a decoder for BOTH clips of the cut (the incoming one opens at
// the window start, the outgoing one closes at its end); without a transition the clips never overlap, so one decoder is enough.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project, render } from './harness-helpers';

test.setTimeout(120_000);

const file = join(ensureFixtures(), 'with-audio.mp4'); // 3 s
const FMT = { width: 128, height: 72, fps: 30 };

async function peakDecoders(page: import('@playwright/test').Page, withTransition: boolean): Promise<{ peak: number; open: number }> {
  const [m] = await importPaths(page, [file]);
  const a = clipOf(m, { start: 0, in: 0.5, out: 2 });
  const b = clipOf(m, { start: 1.5, in: 0.5, out: 2 });
  const p = project(FMT, [m], [a, b]);
  if (withTransition) {
    p.tracks[0] = { ...p.tracks[0], transitions: [{ id: 't1', fromClipId: a.id, toClipId: b.id, type: 'dissolve', duration: 0.6, ease: { kind: 'linear' } }] };
  }
  return page.evaluate(async (p) => {
    window.cf.resetVideoSourceStats();
    const r = await window.cf.runExport(p, { maxLongSide: 128 });
    if (r.error) throw new Error(r.error.message);
    return { peak: window.cf.videoSourceStats().peak, open: window.cf.videoSourceStats().open };
  }, p);
}

test('the export opens the incoming decoder at the window start and closes the outgoing one at its end', async ({ page }) => {
  await openHarness(page);
  expect((await peakDecoders(page, false)).peak).toBe(1);
  const t = await peakDecoders(page, true);
  expect(t.peak).toBe(2);
  expect(t.open).toBe(0);
});

test('a frame inside the window renders with a handle frame and is not black (the real blend is checked in Task 5)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [file]);
  const a = clipOf(m, { start: 0, in: 0.1, out: 1.6, transform: { scale: 0.2 } });
  const b = clipOf(m, { start: 1.5, in: 2.0, out: 2.9, transform: { scale: 0.2 } });
  const p = project(FMT, [m], [a, b]);
  p.tracks[0] = { ...p.tracks[0], transitions: [{ id: 't1', fromClipId: a.id, toClipId: b.id, type: 'dissolve', duration: 0.6, ease: { kind: 'linear' } }] };
  const [mid] = await render(page, p, [1.5]);
  expect(Array.from(mid.data).some((v) => v > 0)).toBe(true);
  expect(mid.glError).toBe(0);
});
