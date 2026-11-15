// Plan 5E (data v8): crop, flip and anchor. Crop is a MASK on the full (uncropped, displayed) frame (D1): the clip's
// x/y/scale/rotation and its default pivot keep referring to the full frame, so cropping never moves visible pixels.

/** Fractions (0..1) of the DISPLAYED source frame, measured from each edge. */
export interface Crop {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Mirror of the cropped picture, applied before the clip's rotation (D3). Only `true` is ever stored. */
export interface Flip {
  h?: true;
  v?: true;
}

/** The pivot as a fraction of the FULL frame measured from its centre (x right, y down); {0, 0} = centre (D4). */
export interface Anchor {
  x: number;
  y: number;
}

/** Largest a single edge may be (D2). */
export const MAX_CROP_EDGE = 0.95;
/** Smallest fraction of an axis that must remain visible (D2/D10: the media-less floor used by migration). */
export const MIN_CROP_REMAINING = 0.02;
/** Smallest visible size in source pixels (D2: enforced at edit time, where the media size is known). */
export const MIN_CROP_PIXELS = 8;
/** The anchor stays within this many frame sizes of the centre (D4, D10). */
export const ANCHOR_LIMIT = 2;

/** The smallest visible fraction of an axis whose source side is `sidePx` long (2 %, or 8 px when the side is known). */
export const cropMinimum = (sidePx?: number): number =>
  Math.max(MIN_CROP_REMAINING, sidePx && sidePx > 0 ? MIN_CROP_PIXELS / sidePx : 0);

const EDGES = ['left', 'top', 'right', 'bottom'] as const;

export const NO_CROP: Crop = { left: 0, top: 0, right: 0, bottom: 0 };

export function isCropped(c: Crop | undefined): c is Crop {
  return c !== undefined && (c.left > 0 || c.top > 0 || c.right > 0 || c.bottom > 0);
}

function fin(v: unknown): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0;
}

/**
 * Clamps `c` to the limits (D2): each edge 0..MAX_CROP_EDGE, each axis keeps at least `minFraction` visible (the sum
 * of its two edges is reduced proportionally). `minFraction` = max(MIN_CROP_REMAINING, MIN_CROP_PIXELS / source side)
 * at edit time. Non-finite edges count as 0. Pure: returns a new object.
 */
export function clampCrop(c: Crop, minX = MIN_CROP_REMAINING, minY = MIN_CROP_REMAINING): Crop {
  const e = {} as Crop;
  for (const k of EDGES) e[k] = Math.min(MAX_CROP_EDGE, Math.max(0, fin(c[k])));
  const axis = (a: number, b: number, min: number): [number, number] => {
    const room = Math.max(0, 1 - Math.max(min, 0));
    const sum = a + b;
    return sum <= room || sum === 0 ? [a, b] : [(a * room) / sum, (b * room) / sum];
  };
  [e.left, e.right] = axis(e.left, e.right, minX);
  [e.top, e.bottom] = axis(e.top, e.bottom, minY);
  return e;
}

/** `undefined` when the crop is all zero (identity is never stored). */
export function normaliseCrop(c: Crop | undefined): Crop | undefined {
  return isCropped(c) ? c : undefined;
}
