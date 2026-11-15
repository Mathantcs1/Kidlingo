// Pure crop / flip maths for the compositor and the on-canvas handles (Plan 5E D1, D3, D6). Column-major Mat3 like
// geometry.ts. Everything is optional: an absent crop/flip returns the input untouched (bit-identical to 5B).
import type { Crop, Flip } from '../core/cropTypes';
import { isCropped } from '../core/cropTypes';
import type { Mat3, Size } from './geometry';

/** a · b (apply b first, then a), column-major. */
export function mulMat3(a: Mat3, b: Mat3): Mat3 {
  const r = new Array<number>(9).fill(0);
  for (let c = 0; c < 3; c++) {
    for (let row = 0; row < 3; row++) {
      r[c * 3 + row] = a[row] * b[c * 3] + a[3 + row] * b[c * 3 + 1] + a[6 + row] * b[c * 3 + 2];
    }
  }
  return r as Mat3;
}

/** The displayed size of the cropped region. */
export function croppedSize(size: Size, crop: Crop | undefined): Size {
  if (!isCropped(crop)) return size;
  return { width: size.width * (1 - crop.left - crop.right), height: size.height * (1 - crop.top - crop.bottom) };
}

/** Maps the unit square of the CROPPED view onto its sub-rectangle of the full displayed frame. */
export function cropRectMatrix(crop: Crop): Mat3 {
  const w = 1 - crop.left - crop.right;
  const h = 1 - crop.top - crop.bottom;
  return [w, 0, 0, 0, h, 0, crop.left, crop.top, 1];
}

/** Mirrors the unit square: u -> 1 - u (h), v -> 1 - v (v). */
export function flipMatrix(flip: Flip): Mat3 {
  return [flip.h ? -1 : 1, 0, 0, 0, flip.v ? -1 : 1, 0, flip.h ? 1 : 0, flip.v ? 1 : 0, 1];
}

/**
 * The texture-lookup matrix for a cropped, flipped picture: `orientation` (uvMatrix of rotation/mirror, mapping the
 * displayed frame to the raw texture) after the crop sub-rectangle, after the flip: cropped-view (s, t) -> flip ->
 * crop rect -> displayed (u, v) -> raw texture. `inset` is half a texel in displayed unit coordinates (x, y): the crop
 * rectangle shrinks by it on every CROPPED edge so bilinear sampling never reads cropped-away pixels (D7).
 */
export function croppedUvMatrix(orientation: Mat3, crop: Crop | undefined, flip: Flip | undefined, inset = { x: 0, y: 0 }): Mat3 {
  let m = orientation;
  if (isCropped(crop)) {
    const c: Crop = {
      left: crop.left > 0 ? crop.left + inset.x : 0,
      right: crop.right > 0 ? crop.right + inset.x : 0,
      top: crop.top > 0 ? crop.top + inset.y : 0,
      bottom: crop.bottom > 0 ? crop.bottom + inset.y : 0,
    };
    m = mulMat3(m, cropRectMatrix(c));
  }
  if (flip && (flip.h || flip.v)) m = mulMat3(m, flipMatrix(flip));
  return m;
}
