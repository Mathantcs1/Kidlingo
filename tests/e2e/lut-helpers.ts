// .cube fixtures and the CPU reference for the LUT effect specs (Plan 4 Task 6).
import { execFileSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { parseCube } from '../../src/media/cube';
import type { CubeLut } from '../../src/media/cube';
import type { VideoEffect } from '../../src/core/model';
import { lutPixel } from '../../src/render/effects/lutMath';

export type V3 = [number, number, number];

/** A .cube text of `size` whose lattice point (r, g, b) holds fn(r/(n−1), g/(n−1), b/(n−1)), red fastest. */
export function cubeText(size: number, fn: (c: V3) => V3, head: string[] = []): string {
  const lines = [...head, `LUT_3D_SIZE ${size}`];
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) {
    lines.push(fn([r, g, b].map((v) => v / (size - 1)) as V3).map((v) => v.toFixed(6)).join(' '));
  }
  return lines.join('\n');
}

export const IDENTITY = (c: V3): V3 => c;
export const INVERT = (c: V3): V3 => c.map((v) => 1 - v) as V3;
/** Non-trivial and asymmetric: red and blue swapped, each with its own gamma, green with a curve. */
export const SWAP_GAMMA = ([r, g, b]: V3): V3 => [b ** 0.6, 0.15 + 0.7 * g ** 1.8, r ** 1.4];

let n = 0;
export const lutFx = (ref: string, intensity = 1): VideoEffect =>
  ({ id: `lutfx-${++n}`, type: 'lut', enabled: true, params: { intensity }, ref });

/** lutPixel on 0..255 values. */
export const expectedLut = (c: number[], lut: CubeLut, intensity = 1): number[] =>
  lutPixel([c[0] / 255, c[1] / 255, c[2] / 255], lut, intensity).map((v) => v * 255);

export { parseCube };

/** A solid-colour PNG made with ffmpeg in the test's output dir (for the app's file input). */
export function solidPng(name: string, hex: string, size = '192x108'): string {
  const dir = test.info().outputPath('img');
  mkdirSync(dir, { recursive: true });
  const out = join(dir, name);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `color=c=${hex}:s=${size}`, '-frames:v', '1', out]);
  return out;
}
