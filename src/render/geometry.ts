// Pure geometry for the compositor (no DOM, no GL), so it can be unit-tested.
import type { Transform } from '../core/model';

/** A 3x3 matrix in column-major order (as `uniformMatrix3fv` expects). */
export type Mat3 = [number, number, number, number, number, number, number, number, number];

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Applies `m` to the point (x, y, 1) and returns the resulting (x, y). */
export function applyMat3(m: Mat3, x: number, y: number): [number, number] {
  return [m[0] * x + m[3] * y + m[6], m[1] * x + m[4] * y + m[7]];
}

/**
 * Maps the unit quad (u, v) ∈ [0, 1]², v = 0 at the top of the source image, to clip space for a canvas of
 * `canvas` logical pixels. The quad is `src * scale` pixels, rotated `rotation` degrees clockwise about its
 * centre, then centred at (x, y) canvas pixels from the canvas centre with y pointing down.
 */
export function clipMatrix(src: Size, t: Transform, canvas: Size): Mat3 {
  const sw = src.width * t.scale;
  const sh = src.height * t.scale;
  const rad = (t.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Canvas pixels relative to the centre (y down): p = R · ((u - ½)·sw, (v - ½)·sh) + (x, y).
  const ax = 2 / canvas.width;
  const ay = -2 / canvas.height;
  return [
    ax * sw * cos,
    ay * sw * sin,
    0,
    ax * -sh * sin,
    ay * sh * cos,
    0,
    ax * (-0.5 * sw * cos + 0.5 * sh * sin + t.x),
    ay * (-0.5 * sw * sin - 0.5 * sh * cos + t.y),
    1,
  ];
}

/** Maps the unit quad onto the whole of clip space, v = 0 at the top. */
export function fullscreenMatrix(): Mat3 {
  return [2, 0, 0, 0, -2, 0, -1, 1, 1];
}

/** The largest rectangle of `content`'s aspect ratio that fits in `target`, centred; integer pixels, never empty. */
export function letterbox(content: Size, target: Size): Rect {
  const scale = Math.min(target.width / content.width, target.height / content.height);
  const width = Math.max(1, Math.min(target.width, Math.round(content.width * scale)));
  const height = Math.max(1, Math.min(target.height, Math.round(content.height * scale)));
  return {
    x: Math.max(0, Math.floor((target.width - width) / 2)),
    y: Math.max(0, Math.floor((target.height - height) / 2)),
    width,
    height,
  };
}

/** A clockwise display rotation in degrees, as stored in a video track's metadata. */
export type Rotation = 0 | 90 | 180 | 270;

/** The size of a `raw` frame once rotated by `rotation` degrees. */
export function rotatedSize(raw: Size, rotation: Rotation): Size {
  return rotation === 90 || rotation === 270 ? { width: raw.height, height: raw.width } : raw;
}

/**
 * Maps the unit quad's (u, v), v = 0 at the top of the DISPLAYED image, to coordinates in the raw, unrotated
 * texture: the frame shows up rotated `rotation` degrees clockwise and then, with `mirror`, flipped horizontally
 * (Mediabunny's order). `flipV` additionally turns the texture upside down (for framebuffer textures, which are
 * stored bottom row first).
 */
export function uvMatrix(rotation: Rotation, flipV = false, mirror = false): Mat3 {
  const base: Record<Rotation, Mat3> = {
    0: [1, 0, 0, 0, 1, 0, 0, 0, 1],
    90: [0, -1, 0, 1, 0, 0, 0, 1, 1],
    180: [-1, 0, 0, 0, -1, 0, 1, 1, 1],
    270: [0, 1, 0, -1, 0, 0, 1, 0, 1],
  };
  let m = base[rotation];
  // Mirror: the displayed (u, v) shows the rotated image's (1 - u, v).
  if (mirror) m = [-m[0], -m[1], 0, m[3], m[4], 0, m[0] + m[6], m[1] + m[7], 1];
  // flipV: (s, t) -> (s, 1 - t) applied after the rotation.
  if (flipV) m = [m[0], -m[1], 0, m[3], -m[4], 0, m[6], 1 - m[7], 1];
  return m;
}

/**
 * How to orient a decoded frame: the track's rotation/flip minus whatever the frame object says is already applied
 * (VideoFrame.rotation/flip, where a browser or library sets them), so a frame is never turned twice. Frame values
 * that are not quarter turns or booleans are ignored.
 */
export function frameOrientation(
  track: { rotation: Rotation; flip: boolean },
  frame: { rotation?: unknown; flip?: unknown },
): { rotation: Rotation; mirror: boolean } {
  const applied = typeof frame.rotation === 'number' && frame.rotation % 90 === 0 ? frame.rotation : 0;
  const rotation = ((((track.rotation - applied) % 360) + 360) % 360) as Rotation;
  return { rotation, mirror: track.flip !== (frame.flip === true) };
}
