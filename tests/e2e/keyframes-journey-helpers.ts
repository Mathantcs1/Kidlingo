// Helpers for the Plan 5A keyframes journey: the image fixture, store reads and the keyed-gesture steps.
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { center, clipEl } from './helpers';
import { maxDiff, settledBlocks } from './effects-journey-helpers';
import type { Clip, Project } from '../../src/core/model';

export const present = (page: Page): Promise<Project> => page.evaluate(() => window.__clipforge!.getState().history.present);
export const clipOf = async (page: Page, id: string): Promise<Clip> => (await present(page)).tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;
export const setTime = (page: Page, t: number): Promise<void> => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);

/** 192x108 still: red left, blue right, a yellow box at the centre (a Ken Burns subject that is easy to see in block means). */
export function kenPng(): string {
  const dir = test.info().outputPath('img');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, 'ken.png');
  const vf = 'drawbox=x=96:y=0:w=96:h=108:color=0x2040d0:t=fill,drawbox=x=72:y=34:w=48:h=40:color=0xf0e020:t=fill';
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=0xd02020:s=192x108', '-vf', vf, '-frames:v', '1', out]);
  return out;
}

/** Preview block grids at each time (settled). */
export async function grabs(page: Page, times: number[]): Promise<number[][][]> {
  const out: number[][][] = [];
  for (const t of times) out.push(await settledBlocks(page, t));
  return out;
}

/** Largest block-mean difference between two lists of grids, per time. */
export const diffs = (a: number[][][], b: number[][][]): number[] => a.map((g, i) => maxDiff(g, b[i]));

/** Drags a clip's trim handle by `dx` px (60 px per second). */
export async function dragTrim(page: Page, id: string, edge: 'start' | 'end', dx: number): Promise<void> {
  const from = await center(clipEl(page, id).getByTestId(`trim-${edge}`));
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + dx, from.y, { steps: 6 });
  await page.mouse.up();
}
