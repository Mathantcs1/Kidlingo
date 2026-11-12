// Layers in preview, export and audio: hidden video tracks are neither drawn nor decoded; muted and soloed
// tracks decide what is heard (solo applies to any track kind, mute always wins).
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures, ffmpegFrame } from './fixtures';
import { importFiles, open } from './helpers';
import { clipOf, expectNear, importPaths, openHarness, px, render } from './harness-helpers';
import { newTrack } from '../../src/core/model';
import type { Clip, MediaRef, Project, Track } from '../../src/core/model';
import { CURRENT_VERSION } from '../helpers/project';

test.setTimeout(120_000);

const dir = ensureFixtures();
const withAudio = join(dir, 'with-audio.mp4');
const noAudio = join(dir, 'no-audio.mp4');
const tone = join(dir, 'tone.wav');

type Rgb = [number, number, number];
const RED: Rgb = [220, 30, 30];
const GREEN: Rgb = [30, 200, 60];
const BLACK: Rgb = [0, 0, 0];
const FMT = { width: 64, height: 64, fps: 10 };

function track(kind: Track['kind'], id: string, clips: Clip[], over: Partial<Track> = {}): Track {
  return { ...newTrack(kind), id, clips, ...over };
}

function projectOf(tracks: Track[], media: MediaRef[], format = FMT): Project {
  return { version: CURRENT_VERSION, format, tracks, media: Object.fromEntries(media.map((m) => [m.id, m])) };
}

/** Red 48×48 on the bottom video track, green 32×32 on the top one, both centred in a 64×64 frame. */
async function twoLayers(page: Page): Promise<(hidden: { bottom?: boolean; top?: boolean }) => Project> {
  const [red, green] = await page.evaluate(
    ({ RED, GREEN }) => Promise.all([window.cf.putImageMedia(48, 48, RED), window.cf.putImageMedia(32, 32, GREEN)]),
    { RED, GREEN },
  );
  const bottom = clipOf(red, { out: 1 });
  const top = clipOf(green, { out: 1 });
  return (hidden) =>
    projectOf(
      [
        track('video', 'bottom', [bottom], { hidden: hidden.bottom ?? false }),
        track('video', 'top', [top], { hidden: hidden.top ?? false }),
        track('audio', 'audio', []),
      ],
      [red, green],
    );
}

const STATES: [string, { bottom?: boolean; top?: boolean }, Rgb, Rgb][] = [
  // name, hidden flags, centre colour, colour at (10, 32) (inside red, outside green)
  ['both visible', {}, GREEN, RED],
  ['top hidden', { top: true }, RED, RED],
  ['both hidden', { top: true, bottom: true }, BLACK, BLACK],
];

test('hidden layers are not drawn in the preview; hiding is just a project change', async ({ page }) => {
  await openHarness(page);
  const make = await twoLayers(page);
  for (const [name, hidden, centre, side] of STATES) {
    const [f] = await render(page, make(hidden), [0.5]);
    expect(f.glError).toBe(0);
    expectNear(px(f, 32, 32), centre, 6, `${name} centre`);
    expectNear(px(f, 10, 32), side, 6, `${name} side`);
    expectNear(px(f, 2, 2), BLACK, 6, `${name} corner`);
  }
  // Unhiding again restores the composite exactly.
  const [again] = await render(page, make({}), [0.5]);
  expectNear(px(again, 32, 32), GREEN, 6, 'unhidden centre');
});

test('the export shows the same layers as the preview, hidden ones left out', async ({ page }) => {
  await openHarness(page);
  const make = await twoLayers(page);
  mkdirSync(test.info().outputDir, { recursive: true });
  for (const [name, hidden, centre, side] of STATES) {
    const p = make(hidden);
    const [preview] = await render(page, p, [0.5]);
    const b64 = await page.evaluate(({ p }) => window.cf.exportBase64(p, 64), { p });
    const out = join(test.info().outputDir, `layers-${name.replace(/ /g, '-')}.mp4`);
    writeFileSync(out, Buffer.from(b64, 'base64'));
    const frame = ffmpegFrame(out, 5);
    expect([frame.width, frame.height]).toEqual([64, 64]);
    const img = { width: frame.width, data: frame.rgb };
    for (const [x, y] of [[32, 32], [10, 32], [2, 2]]) {
      expectNear(px(img, x, y, 3), px(preview, x, y), 40, `${name} exported pixel (${x}, ${y})`);
    }
    expectNear(px(img, 32, 32, 3), centre, 40, `${name} exported centre`);
    expectNear(px(img, 10, 32, 3), side, 40, `${name} exported side`);
  }
});

test('the exporter opens no decoder for a video clip on a hidden layer', async ({ page }) => {
  await openHarness(page);
  const [m] = await importPaths(page, [noAudio]);
  const [green] = await page.evaluate(() => Promise.all([window.cf.putImageMedia(16, 16, [30, 200, 60])]));
  const make = (hidden: boolean): Project =>
    projectOf(
      [
        track('video', 'base', [clipOf(green, { out: 1 })]),
        track('video', 'pip', [clipOf(m, { out: 1, transform: { scale: 0.1 } })], { hidden }),
        track('audio', 'audio', []),
      ],
      [m, green],
    );
  for (const [hidden, opened] of [[true, 0], [false, 1]] as const) {
    await page.evaluate(() => window.cf.resetVideoSourceStats());
    const r = await page.evaluate((p) => window.cf.runExport(p, { maxLongSide: 64 }), make(hidden));
    expect(r.error).toBeNull();
    const stats = await page.evaluate(() => window.cf.videoSourceStats());
    expect(stats.opened, `hidden=${hidden}`).toBe(opened);
    expect(stats.open).toBe(0);
  }
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

test('the preview opens no decoder for a hidden layer and closes it when a layer is hidden', async ({ page }) => {
  await open(page);
  await importFiles(page, [noAudio], 1);
  const stats = () => page.evaluate(() => window.__clipforge!.videoSourceStats());
  const setHidden = async (hidden: boolean, t: number): Promise<void> => {
    await page.evaluate((hidden) => {
      const { apply } = window.__clipforge!.getState();
      apply((p) => ({ ...p, tracks: p.tracks.map((tr) => (tr.kind === 'video' ? { ...tr, hidden } : tr)) }));
    }, hidden);
    await page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
    await waitRendered(page, t);
  };
  // The clip arrives on a video track that is already hidden.
  await page.evaluate(() => {
    const { apply } = window.__clipforge!.getState();
    apply((p) => {
      const m = Object.values(p.media)[0];
      const clip = {
        id: 'hidden-clip',
        mediaId: m.id,
        kind: 'video' as const,
        start: 0,
        in: 0,
        out: 1,
        volume: 1,
        audio: { fadeIn: 0, fadeOut: 0, pan: 0, silent: false, effects: [] }, effects: [], blend: 'normal' as const,
        fit: 'fit' as const,
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      };
      return { ...p, tracks: p.tracks.map((tr) => (tr.kind === 'video' ? { ...tr, hidden: true, clips: [clip] } : tr)) };
    });
  });
  const before = await stats();
  await setHidden(true, 0.25);
  await setHidden(true, 0.5);
  const hidden = await stats();
  expect(hidden.opened - before.opened).toBe(0);
  expect(hidden.open).toBe(0);
  // Control: once shown, the same clip does open a decoder ...
  await setHidden(false, 0.6);
  const shown = await stats();
  expect(shown.opened - before.opened).toBe(1);
  expect(shown.open).toBe(1);
  // ... which is closed again (not kept as a "recent" source) when its layer is hidden.
  await setHidden(true, 0.7);
  expect((await stats()).open).toBe(0);
});

test('mute and solo decide which tracks are heard in the mixdown', async ({ page }) => {
  await openHarness(page);
  const [video, t1] = await importPaths(page, [withAudio, tone]);
  // Video audio in [0, 1), audio track a1 in [1, 2), audio track a2 in [2, 3).
  const make = (flags: Partial<Record<'v' | 'a1' | 'a2', Partial<Track>>> = {}): Project =>
    projectOf(
      [
        track('video', 'v', [clipOf(video, { out: 1 })], flags.v),
        track('audio', 'a1', [clipOf(t1, { start: 1, out: 1 })], flags.a1),
        track('audio', 'a2', [clipOf(t1, { start: 2, out: 1 })], flags.a2),
      ],
      [video, t1],
    );
  const windows: [number, number][] = [
    [0.1, 0.9],
    [1.1, 1.9],
    [2.1, 2.9],
  ];
  const peaks = async (p: Project): Promise<number[]> => {
    const r = await page.evaluate(({ p, windows }) => window.cf.mixdownStats(p, 48000, windows), { p, windows });
    return r ? r.peaks : [0, 0, 0];
  };
  const heard = async (p: Project): Promise<boolean[]> => {
    const levels = await peaks(p);
    for (const l of levels) expect(l < 0.001 || l > 0.05, `clear-cut level ${l}`).toBe(true);
    return levels.map((l) => l > 0.05);
  };

  expect(await heard(make())).toEqual([true, true, true]);
  expect(await heard(make({ a1: { muted: true } }))).toEqual([true, false, true]);
  expect(await heard(make({ a2: { solo: true } }))).toEqual([false, false, true]);
  expect(await heard(make({ v: { solo: true } }))).toEqual([true, false, false]);
  expect(await heard(make({ v: { solo: true }, a1: { solo: true } }))).toEqual([true, true, false]);
  expect(await heard(make({ a1: { solo: true, muted: true } }))).toEqual([false, false, false]);
  expect(await heard(make({ v: { hidden: true } }))).toEqual([true, true, true]);
  // Everything muted: nothing to render at all.
  const silent = make({ v: { muted: true }, a1: { muted: true }, a2: { muted: true } });
  expect(await page.evaluate((p) => window.cf.mixdownStats(p, 48000, [[0, 3]]), silent)).toBeNull();
});
