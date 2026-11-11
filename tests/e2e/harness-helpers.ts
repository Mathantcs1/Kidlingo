// Shared helpers for specs that drive the in-browser harness (/harness.html, window.cf).
import { expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { defaultClipAudio, newTrack } from '../../src/core/model';
import type { Clip, MediaRef, Project, Track, Transform } from '../../src/core/model';

export type Rgb = [number, number, number];

export interface Frame {
  width: number;
  height: number;
  data: number[];
  glError: number;
}

export async function openHarness(page: Page): Promise<void> {
  await page.goto('/harness.html');
  await page.waitForFunction(() => window.cf !== undefined);
}

/** Imports the files through the harness file input, in order. */
export async function importPaths(page: Page, paths: string[]): Promise<MediaRef[]> {
  await page.setInputFiles('#harness-file', paths);
  const out: MediaRef[] = [];
  for (let i = 0; i < paths.length; i++) out.push(await page.evaluate((i) => window.cf.importInputFile(i), i));
  return out;
}

let seq = 0;
export function clipOf(m: MediaRef, over: Partial<Omit<Clip, 'transform'>> & { transform?: Partial<Transform> } = {}): Clip {
  const { transform, ...rest } = over;
  return {
    id: `clip-${++seq}`,
    mediaId: m.id,
    kind: m.kind as Clip['kind'],
    start: 0,
    in: 0,
    out: m.duration,
    volume: 1,
    audio: defaultClipAudio(), effects: [], blend: 'normal',
    fit: 'fit',
    ...rest,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...transform },
  };
}

/** One video track holding `video` (sorted by the caller) plus an audio track. */
export function project(format: Project['format'], media: MediaRef[], video: Clip[]): Project {
  const tracks: Track[] = [
    { ...newTrack('video'), id: 'video', clips: video },
    { ...newTrack('audio'), id: 'audio' },
  ];
  return { version: 5, format, tracks, media: Object.fromEntries(media.map((m) => [m.id, m])) };
}

export function render(
  page: Page,
  p: Project,
  times: number[],
  opts: { canvas?: { width: number; height: number }; sources?: boolean } = {},
): Promise<Frame[]> {
  return page.evaluate(({ p, times, opts }) => window.cf.renderPixels(p, times, opts), { p, times, opts });
}

export function px(f: { width: number; data: ArrayLike<number> }, x: number, y: number, channels = 4): number[] {
  const i = (y * f.width + x) * channels;
  return Array.from({ length: 3 }, (_, k) => f.data[i + k]);
}

export function expectNear(actual: number[], expected: number[], tol: number, msg: string): void {
  for (let k = 0; k < 3; k++) expect(Math.abs(actual[k] - expected[k]), `${msg}: ${actual} vs ${expected}`).toBeLessThanOrEqual(tol);
}
