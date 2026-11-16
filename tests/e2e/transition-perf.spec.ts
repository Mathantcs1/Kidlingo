// Plan 5C Task 7: cost of a transition frame at 1080p on the software renderer against the same frame with ONE Screen-blend
// layer (the existing composite path). The ratio is measured and recorded (ruling T10-1-style); the guard is generous.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clipOf, openHarness, project } from './harness-helpers';
import { addTransition } from '../../src/core/transitionEdits';
import { newTrack } from '../../src/core/model';
import type { MediaRef, Project } from '../../src/core/model';

test.setTimeout(240_000);

const solid = (page: Page, w: number, h: number, rgb: [number, number, number]): Promise<MediaRef> =>
  page.evaluate(({ w, h, rgb }) => window.cf.putImageMedia(w, h, rgb), { w, h, rgb });

/** Median milliseconds of `runs` renders of `times` (a fresh compositor each: creation cost is the same on both sides). */
async function median(page: Page, p: Project, times: number[], runs: number): Promise<number> {
  const ms = await page.evaluate(
    async ({ p, times, runs }) => {
      const out: number[] = [];
      for (let i = 0; i < runs; i++) {
        const t0 = performance.now();
        const r = await window.cf.renderBlend([p], times, { canvas: { width: 1920, height: 1080 } });
        if (r.error) throw new Error(r.error);
        out.push(performance.now() - t0);
      }
      return out;
    },
    { p, times, runs },
  );
  return [...ms].sort((a, b) => a - b)[Math.floor(ms.length / 2)];
}

test('a 1080p transition frame costs at most 2.5x the same frame with one Screen-blend layer', async ({ page }) => {
  await openHarness(page);
  const [r, b] = await Promise.all([solid(page, 1920, 1080, [200, 40, 40]), solid(page, 1920, 1080, [40, 40, 200])]);
  const fmt = { width: 1920, height: 1080, fps: 30 };
  const a = clipOf(r, { id: 'a', start: 0, in: 0, out: 2, transform: { scale: 1 } });
  const c = clipOf(b, { id: 'c', start: 2, in: 0, out: 2, transform: { scale: 1 } });
  const plain = project(fmt, [r, b], [a, c]);
  const trans = addTransition(plain, plain.tracks[0].id, 'a', 'c', { type: 'dissolve', duration: 1, ease: { kind: 'linear' } });
  const bg = { ...newTrack('video'), id: 'bg', clips: [clipOf(r, { id: 'bg-clip', start: 0, in: 0, out: 4, transform: { scale: 1 } })] };
  const fg = { ...newTrack('video'), id: 'fg', clips: [clipOf(b, { id: 'fg-clip', start: 0, in: 0, out: 4, blend: 'screen', transform: { scale: 1 } })] };
  const screen: Project = { ...plain, tracks: [bg, fg, ...plain.tracks.filter((t) => t.kind === 'audio')] };
  const times = [1.8, 1.9, 2, 2.1, 2.2];
  await median(page, trans, times, 1); // warm up (shader compile)
  await median(page, screen, times, 1);
  const tMs = await median(page, trans, times, 5);
  const sMs = await median(page, screen, times, 5);
  console.log(`1080p x5 frames: transition ${tMs.toFixed(0)} ms, one Screen layer ${sMs.toFixed(0)} ms, ratio ${(tMs / sMs).toFixed(2)}`);
  expect(tMs / sMs).toBeLessThanOrEqual(2.5);
});
