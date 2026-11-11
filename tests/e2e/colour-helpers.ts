// Fixtures and reference helpers for the colour effect specs (Plan 4 Task 4).
import type { Page } from '@playwright/test';
import { clipOf, px } from './harness-helpers';
import { newTrack } from '../../src/core/model';
import type { MediaRef, Project, VideoEffect } from '../../src/core/model';
import { VIDEO_EFFECTS, defaultParams } from '../../src/core/videoEffects';
import { colourPixel } from '../../src/render/effects/colourMath';

export type Rgb = [number, number, number];
export type Pixels = { width: number; data: number[] };

let n = 0;
export const colour = (params: Record<string, number> = {}): VideoEffect =>
  ({ id: `cfx-${++n}`, type: 'colour', enabled: true, params: { ...defaultParams('colour'), ...params } });

/** colourPixel on 0..255 values. */
export const expected = (c: number[], p: Record<string, number>): number[] =>
  colourPixel([c[0] / 255, c[1] / 255, c[2] / 255], { ...defaultParams('colour'), ...p }).map((v) => v * 255);

/** Each of the nine params alone at its min and at its max (18 sets). */
export const PARAM_EXTREMES: Record<string, number>[] = VIDEO_EFFECTS.colour.params
  .flatMap((d) => [{ [d.key]: d.min }, { [d.key]: d.max }]);

/** Draws the edge or gradient fixture on a canvas in the page and stores it as PNG image media. */
async function canvasImage(page: Page, width: number, height: number, kind: 'edge' | 'gradient', c: Rgb): Promise<MediaRef> {
  return page.evaluate(async ({ width, height, kind, c }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    if (kind === 'edge') {
      ctx.fillStyle = `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
      ctx.fillRect(0, 0, 32, height);
      ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.5)`;
      ctx.fillRect(32, 0, 8, height);
      ctx.fillStyle = `rgba(${c[0]}, ${c[1]}, ${c[2]}, 0.15)`;
      ctx.fillRect(40, 0, 4, height);
    } else {
      for (let x = 0; x < width; x++) {
        ctx.fillStyle = `rgb(${x}, ${x}, ${x})`;
        ctx.fillRect(x, 0, 1, 16);
        const hue = (x * 360) / width;
        for (const [y, l] of [[16, 50], [32, 25], [40, 75]]) {
          ctx.fillStyle = `hsl(${hue}, 100%, ${l}%)`;
          ctx.fillRect(x, y, 1, y === 16 ? 16 : 8);
        }
      }
    }
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
    const id = `${kind}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await window.cf.putMedia(id, blob);
    return { id, name: `${id}.png`, kind: 'image', duration: 5, width, height, hasAudio: false } as const;
  }, { width, height, kind, c });
}

/** 64x64: columns 0-31 opaque `c`, 32-39 `c` at 50 % alpha, 40-43 `c` at 15 % alpha, the rest transparent. */
export const edgeImage = (page: Page, c: Rgb): Promise<MediaRef> => canvasImage(page, 64, 64, 'edge', c);

/**
 * 256x48: rows 0-15 a grey ramp (x = level 0..255), rows 16-31 a full-saturation hue sweep (x → hue) at lightness
 * 50 %, rows 32-39 at 25 %, rows 40-47 at 75 %.
 */
export const gradientImage = (page: Page): Promise<MediaRef> => canvasImage(page, 256, 48, 'gradient', [0, 0, 0]);

/** The clip over a black (canvas) and over a white (track below) backdrop. */
export function overBackdrops(m: MediaRef, white: MediaRef, effects: VideoEffect[], format: Project['format']): [Project, Project] {
  const fg = { ...newTrack('video'), id: 'fg', clips: [clipOf(m, { out: 1, effects })] };
  const bg = { ...newTrack('video'), id: 'bg', clips: [clipOf(white, { out: 1 })] };
  const audio = { ...newTrack('audio'), id: 'audio' };
  const media = { [m.id]: m, [white.id]: white };
  return [
    { version: 4, format, tracks: [fg, audio], media },
    { version: 4, format, tracks: [bg, fg, audio], media },
  ];
}

/** Straight colour (0..255) and alpha (0..1) of a pixel from its composite over black and over white. */
export function straight(black: Pixels, white: Pixels, x: number, y: number): { rgb: number[]; a: number } {
  const b = px(black, x, y);
  const w = px(white, x, y);
  const a = 1 - (w[0] - b[0] + w[1] - b[1] + w[2] - b[2]) / 3 / 255;
  return { rgb: b.map((v) => v / a), a };
}
