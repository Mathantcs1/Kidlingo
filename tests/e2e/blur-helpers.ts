// Fixtures and CPU-reference glue for the blur-family specs (Plan 4 Task 7: blur, sharpen, glow, pixelate).
import type { Page } from '@playwright/test';
import { VIDEO_EFFECTS, defaultParams } from '../../src/core/videoEffects';
import { blurRef, glowRef, pixelateRef, sharpenRef } from '../../src/render/effects/blurRef';
import type { FloatImage } from '../../src/render/effects/blurRef';
import type { MediaRef, Project, VideoEffect, VideoEffectType } from '../../src/core/model';

export type BlurType = 'blur' | 'sharpen' | 'glow' | 'pixelate';
export type Pixels = { width: number; height: number; data: number[] };
/** A filled rectangle of a fixture: x, y, width, height and straight RGBA (0..255, alpha 0..1). */
export type Rect = [number, number, number, number, [number, number, number, number]];

let n = 0;
export const fx = (type: BlurType, params: Record<string, number> = {}, enabled = true): VideoEffect =>
  ({ id: `bfx-${++n}`, type: type as VideoEffectType, enabled, params: { ...defaultParams(type), ...params } });

export const renderEffects = (page: Page, p: Project, times: number[]) =>
  page.evaluate(({ p, times }) => window.cf.renderEffects(p, times), { p, times });

/** A `width`×`height` PNG image media: transparent, then each rect filled in order (canvas 2D, straight colour). */
export function rectImage(page: Page, width: number, height: number, rects: Rect[]): Promise<MediaRef> {
  return page.evaluate(async ({ width, height, rects }) => {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    for (const [x, y, w, h, [r, g, b, a]] of rects) {
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${a})`;
      ctx.fillRect(x, y, w, h);
    }
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
    const id = `rects-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await window.cf.putMedia(id, blob);
    return { id, name: `${id}.png`, kind: 'image', duration: 5, width, height, hasAudio: false } as const;
  }, { width, height, rects });
}

/** Sum of R+G+B over the whole frame (0..255 units). */
export function energy(f: Pixels): number {
  let s = 0;
  for (let i = 0; i < f.data.length; i += 4) s += f.data[i] + f.data[i + 1] + f.data[i + 2];
  return s;
}

/** Largest per-channel RGB difference between two frames of the same size. */
export function worstDiff(a: Pixels, b: Pixels): number {
  let worst = 0;
  for (let i = 0; i < a.data.length; i++) if (i % 4 !== 3) worst = Math.max(worst, Math.abs(a.data[i] - b.data[i]));
  return worst;
}

/** Each param of `type` alone at its min and at its max. */
export const extremes = (type: BlurType): Record<string, number>[] =>
  VIDEO_EFFECTS[type].params.flatMap((d) => [{ [d.key]: d.min }, { [d.key]: d.max }]);

/** A premultiplied float image from straight RGB (0..255) and alpha (0..1, clamped; 0 ⇒ transparent black). */
export function floatImage(width: number, height: number, at: (x: number, y: number) => { rgb: number[]; a: number }): FloatImage {
  const data = new Float32Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const { rgb, a: raw } = at(x, y);
      const a = Math.min(1, Math.max(0, raw));
      if (a === 0) continue;
      data.set([(rgb[0] / 255) * a, (rgb[1] / 255) * a, (rgb[2] / 255) * a, a], (y * width + x) * 4);
    }
  }
  return { width, height, data };
}

/** An opaque rendered frame as a premultiplied float image. */
export const opaque = (f: Pixels): FloatImage =>
  floatImage(f.width, f.height, (x, y) => ({ rgb: f.data.slice((y * f.width + x) * 4, (y * f.width + x) * 4 + 3), a: 1 }));

/** The CPU reference of `type` (RGBA8 intermediates like the GPU) with `params` over the defaults. */
export function reference(type: BlurType, img: FloatImage, params: Record<string, number>): FloatImage {
  const p = { ...defaultParams(type), ...params };
  if (type === 'blur') return blurRef(img, p, { quantise: true });
  if (type === 'sharpen') return sharpenRef(img, p, { quantise: true });
  if (type === 'glow') return glowRef(img, p, { quantise: true });
  return pixelateRef(img, p);
}

/** Largest |frame − reference| over RGB in 0..255 units (an opaque frame against a premultiplied reference). */
export function worstVsReference(f: Pixels, ref: FloatImage, step = 1): number {
  let worst = 0;
  for (let y = 0; y < f.height; y += step) {
    for (let x = 0; x < f.width; x++) {
      const i = (y * f.width + x) * 4;
      for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(f.data[i + k] - ref.data[i + k] * 255));
    }
  }
  return worst;
}

export const TEXTURE = { width: 96, height: 540, fps: 30 };

/**
 * 96x540 (half the 1080-row reference, so radii are halved): rows 0-179 a grey ramp (x → level), 180-359 a hue
 * sweep at lightness 50 %, 360-539 a 6-px checkerboard of near-white and dark blue with a white bar at x 40-47.
 */
export function textureImage(page: Page): Promise<MediaRef> {
  return page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 540;
    const ctx = canvas.getContext('2d')!;
    for (let x = 0; x < 96; x++) {
      ctx.fillStyle = `rgb(${Math.round((x * 255) / 95)}, ${Math.round((x * 255) / 95)}, ${Math.round((x * 255) / 95)})`;
      ctx.fillRect(x, 0, 1, 180);
      ctx.fillStyle = `hsl(${(x * 360) / 96}, 100%, 50%)`;
      ctx.fillRect(x, 180, 1, 180);
    }
    for (let y = 360; y < 540; y += 6) {
      for (let x = 0; x < 96; x += 6) {
        ctx.fillStyle = ((x + y) / 6) % 2 ? 'rgb(250, 240, 230)' : 'rgb(20, 40, 90)';
        ctx.fillRect(x, y, 6, 6);
      }
    }
    ctx.fillStyle = 'rgb(255, 255, 255)';
    ctx.fillRect(40, 360, 8, 180);
    const blob = await new Promise<Blob>((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
    const id = `texture-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await window.cf.putMedia(id, blob);
    return { id, name: `${id}.png`, kind: 'image', duration: 5, width: 96, height: 540, hasAudio: false } as const;
  });
}
