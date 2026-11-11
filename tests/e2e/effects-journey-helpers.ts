// Helpers for the Plan 4 effects journey: fixtures, preview/export block means and the export step.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ffmpegFrame } from './fixtures';
import { cubeText } from './lut-helpers';
import type { V3 } from './lut-helpers';

export const COLS = 8;
export const ROWS = 4;

/** 192x108 pure-green screen with a red 96x54 box in the middle (keying the green leaves the box). */
export function greenScreenPng(): string {
  const dir = test.info().outputPath('img');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'screen.png');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0x00ff00:s=192x108,drawbox=x=48:y=27:w=96:h=54:color=0xff0000:t=fill', '-frames:v', '1', out]);
  return out;
}

/** A gentle warm .cube: red lifted, blue pulled down. */
export const warmCube = (): Buffer => Buffer.from(cubeText(17, ([r, g, b]: V3): V3 => [r ** 0.85, g, b ** 1.2], ['TITLE "Journey warm"']));

type Blocks = number[][];

/** Mean RGB of each cell of a COLS x ROWS grid over the preview canvas. */
export function previewBlocks(page: Page): Promise<Blocks> {
  return page.evaluate(({ cols, rows }) => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const o = document.createElement('canvas');
    o.width = c.width;
    o.height = c.height;
    const ctx = o.getContext('2d')!;
    ctx.drawImage(c, 0, 0);
    const out: number[][] = [];
    const w = Math.floor(c.width / cols);
    const h = Math.floor(c.height / rows);
    for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
      const d = ctx.getImageData(i * w, j * h, w, h).data;
      const m = [0, 0, 0];
      for (let k = 0; k < d.length; k += 4) for (let ch = 0; ch < 3; ch++) m[ch] += d[k + ch];
      out.push(m.map((v) => v / (d.length / 4)));
    }
    return out;
  }, { cols: COLS, rows: ROWS });
}

/** The same grid over an exported file's frame `index`. */
export function fileBlocks(file: string, index: number): Blocks {
  const { width, height, rgb } = ffmpegFrame(file, index);
  const w = Math.floor(width / COLS);
  const h = Math.floor(height / ROWS);
  const out: Blocks = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) {
    const m = [0, 0, 0];
    for (let y = j * h; y < (j + 1) * h; y++) for (let x = i * w; x < (i + 1) * w; x++) for (let ch = 0; ch < 3; ch++) m[ch] += rgb[(y * width + x) * 3 + ch];
    out.push(m.map((v) => v / (w * h)));
  }
  return out;
}

/** Largest per-channel difference between two grids. */
export const maxDiff = (a: Blocks, b: Blocks): number => Math.max(...a.flatMap((p, i) => p.map((v, ch) => Math.abs(v - b[i][ch]))));

/** Sets the playhead and waits until the preview canvas stops changing (two equal reads 400 ms apart). */
export async function settledBlocks(page: Page, t: number): Promise<Blocks> {
  await page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
  let prev = await previewBlocks(page);
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(400);
    const cur = await previewBlocks(page);
    if (maxDiff(prev, cur) < 0.5) return cur;
    prev = cur;
  }
  throw new Error('preview never settled');
}

/** Exports at 1080p through the dialog and returns the downloaded file's path. */
export async function exportFile(page: Page): Promise<string> {
  const f = (id: string) => page.getByTestId(id);
  await f('btn-export').click();
  await expect(f('export-dialog')).toBeVisible();
  await f('export-quality').selectOption('1080p');
  await f('btn-export-start').click();
  const link = f('export-download');
  await expect(link).toBeVisible({ timeout: 280_000 });
  await expect(f('export-error')).toHaveCount(0);
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  return (await download.path())!;
}
