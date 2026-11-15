// Repairs hand-edited crop, flip and anchor when a save is opened (Plan 5E D10, data v8). Only video and image clips
// keep them (audio, overlay, adjustment lose them). Never mutates its input; unknown extra fields of the clip are kept.
import { ANCHOR_LIMIT, MIN_CROP_REMAINING, clampCrop, normaliseCrop } from './cropTypes';
import type { Anchor, Crop, Flip } from './cropTypes';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function repairCrop(raw: unknown): Crop | undefined {
  if (!isObject(raw)) return undefined;
  const e = (v: unknown): number => (finite(v) ? v : 0);
  return normaliseCrop(clampCrop({ left: e(raw.left), top: e(raw.top), right: e(raw.right), bottom: e(raw.bottom) }, MIN_CROP_REMAINING, MIN_CROP_REMAINING));
}

export function repairFlip(raw: unknown): Flip | undefined {
  if (!isObject(raw)) return undefined;
  const flip: Flip = {};
  if (raw.h === true) flip.h = true;
  if (raw.v === true) flip.v = true;
  return flip.h || flip.v ? flip : undefined;
}

export function repairAnchor(raw: unknown): Anchor | undefined {
  if (!isObject(raw) || !finite(raw.x) || !finite(raw.y)) return undefined;
  const c = (v: number): number => Math.min(ANCHOR_LIMIT, Math.max(-ANCHOR_LIMIT, v)) + 0;
  const a = { x: c(raw.x), y: c(raw.y) };
  return a.x === 0 && a.y === 0 ? undefined : a;
}

/** `clip` with `crop`/`flip`/`anchor` repaired from `raw` (absent when invalid or identity, and always absent off video/image clips). */
export function withCropFlipAnchor<T extends object>(clip: T, raw: Record<string, unknown>): T {
  const { crop: _c, flip: _f, anchor: _a, ...rest } = clip as T & { crop?: unknown; flip?: unknown; anchor?: unknown };
  if (raw.kind !== 'video' && raw.kind !== 'image') return rest as T;
  const crop = repairCrop(raw.crop);
  const flip = repairFlip(raw.flip);
  const anchor = repairAnchor(raw.anchor);
  return { ...rest, ...(crop ? { crop } : {}), ...(flip ? { flip } : {}), ...(anchor ? { anchor } : {}) } as T;
}
