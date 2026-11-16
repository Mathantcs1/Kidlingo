// Plan 5C Task 10: "Merge with crossfade" (ONE undo step, a transition at every new cut, a toast for skipped / shortened cuts)
// and the picture at a joined cut being a 50 % mix. Three clips of with-audio.mp4 trimmed to 0.5..2.5 (0.5 s of handle each side).
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipEl, clipStates, importFiles, open, trackErrors, withAudio } from './helpers';
import { ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, project, px, render } from './harness-helpers';
import { joinClips } from '../../src/core/merge';

test.setTimeout(90_000);

const present = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.present);
const depth = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.past.length);

async function setup(page: Page, firstHandle = 0.5): Promise<string[]> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  for (let i = 1; i <= 3; i++) await addToTimeline(page, 'with-audio.mp4', i);
  const ids = (await clipStates(page)).filter((c) => c.trackKind === 'video').sort((x, y) => x.start - y.start).map((c) => c.id);
  await page.evaluate(([a, b, c, h]) => {
    window.__clipforge!.getState().apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({
        ...t,
        clips: t.clips.map((k) =>
          k.id === a ? { ...k, start: 0, in: 0.5, out: 2.5 } : k.id === b ? { ...k, start: 2.5, in: Number(h), out: Number(h) + 2 } : k.id === c ? { ...k, start: 5.5, in: 0.5, out: 2.5 } : k,
        ),
      })),
    }));
    window.__clipforge!.getState().select([a, b, c]);
  }, [...ids, firstHandle] as unknown as [string, string, string, number]);
  return ids;
}

const openMerge = async (page: Page, id: string) => {
  await clipEl(page, id).click({ button: 'right' });
  await page.getByTestId('transition-menu-merge').click();
};

test('Merge with crossfade: contiguous clips, two transitions, ONE undo step; undo restores the gaps', async ({ page }) => {
  const errors = trackErrors(page);
  const ids = await setup(page);
  const before = JSON.stringify((await present(page)).tracks.map((t) => t.clips.map((c) => c.start)));
  const d = await depth(page);
  await openMerge(page, ids[1]);
  expect(await depth(page)).toBe(d + 1);
  const p = await present(page);
  const video = p.tracks.find((t) => t.kind === 'video')!;
  expect(video.clips.map((c) => c.start)).toEqual([0, 2, 4]);
  expect(video.transitions).toHaveLength(2);
  expect(video.transitions!.every((t) => t.type === 'dissolve')).toBe(true);
  await expect(page.getByTestId('info-toast')).toContainText('2 crossfades added');
  await page.getByTestId('btn-undo').click();
  expect(JSON.stringify((await present(page)).tracks.map((t) => t.clips.map((c) => c.start)))).toBe(before);
  expect((await present(page)).tracks.flatMap((t) => t.transitions ?? [])).toHaveLength(0);
  expect(errors).toEqual([]);
});

test('a cut with no footage beyond it is skipped with a toast; the merge itself still happens', async ({ page }) => {
  const ids = await setup(page, 0); // b starts at footage 0: nothing before it, so a|b has no handle
  await openMerge(page, ids[0]);
  const video = (await present(page)).tracks.find((t) => t.kind === 'video')!;
  expect(video.clips.map((c) => c.start)).toEqual([0, 2, 4]);
  expect(video.transitions!.map((t) => [t.fromClipId, t.toClipId])).toEqual([[ids[1], ids[2]]]);
  await expect(page.getByTestId('info-toast')).toContainText('1 cut skipped');
});

test('the picture at a joined cut is the 50 % mix of the two clips (±3/255)', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [join(ensureFixtures(), 'frame-index.mp4')]); // 4 s, frame N in grey levels
  // Footage 0..1 then 2..3, gap between; both have 1 s of handle either side. Joined: cut at t = 1.
  const a = clipOf(m, { in: 0, out: 1, start: 0, transform: { scale: 1 } });
  const b = clipOf(m, { in: 2, out: 3, start: 1.5, transform: { scale: 1 } });
  const p = project({ width: 128, height: 72, fps: 30 }, [m], [a, b]);
  const joined = joinClips(p, [a.id, b.id], { transition: { type: 'dissolve', duration: 1 } });
  expect(joined.tracks[0].transitions).toHaveLength(1);
  const [mixed] = await render(page, joined, [1]);
  // A alone showing its handle frame at t = 1 (footage 1.0), B alone at its first frame (footage 2.0).
  const aAlone = { ...p, tracks: [{ ...p.tracks[0], clips: [{ ...a, out: 1.5 }] }, ...p.tracks.slice(1)] };
  const bAlone = { ...p, tracks: [{ ...p.tracks[0], clips: [{ ...b, start: 1 }] }, ...p.tracks.slice(1)] };
  const [fa] = await render(page, aAlone, [1]);
  const [fb] = await render(page, bAlone, [1]);
  for (const [x, y] of [[32, 36], [96, 36]] as const) {
    const [pa, pb, pm] = [px(fa, x, y), px(fb, x, y), px(mixed, x, y)];
    for (let k = 0; k < 3; k++) expect(Math.abs(pm[k] - (pa[k] + pb[k]) / 2), `channel ${k} at ${x}: ${pa[k]} ${pb[k]} -> ${pm[k]}`).toBeLessThanOrEqual(3);
  }
});

test('Duplicate (Ctrl+D) of two transitioned clips carries the transition (one step, new ids); one clip alone does not', async ({ page }) => {
  const errors = trackErrors(page);
  const ids = await setup(page);
  await openMerge(page, ids[1]); // a|b and b|c dissolves, clips 0..2, 2..4, 4..6
  await page.evaluate(([b, c]) => window.__clipforge!.getState().select([b, c]), [ids[1], ids[2]]);
  const d = await depth(page);
  await page.keyboard.press('Control+d');
  expect(await depth(page)).toBe(d + 1);
  const video = (await present(page)).tracks.find((t) => t.kind === 'video')!;
  expect(video.clips).toHaveLength(5);
  expect(video.transitions).toHaveLength(3);
  expect(new Set(video.transitions!.map((t) => t.id)).size).toBe(3);
  await page.evaluate((id) => window.__clipforge!.getState().select([id]), ids[0]);
  await page.keyboard.press('Control+d');
  expect((await present(page)).tracks.find((t) => t.kind === 'video')!.transitions).toHaveLength(3); // a lone clip carries none
  expect(errors).toEqual([]);
});
