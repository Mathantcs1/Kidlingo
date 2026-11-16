// The picture of a transition (Plan 5C D6), pure and DOM-free: the CPU mirror of effects/shaders/transition.ts. `a` and `b`
// are the two clips' pictures (premultiplied RGBA, 0..1) as functions of the frame position (x, y in 0..1, y DOWN, transparent
// outside the frame); `e` is the eased progress. The shader reads the same maths from its two layer textures.
import type { TransitionDirection, TransitionType } from '../core/transitionTypes';
import { grainHash } from './effects/looksMath';

export type Pixel = [number, number, number, number];
export type Sampler = (x: number, y: number) => Pixel;

export interface TransitionParams {
  type: TransitionType;
  /** Eased progress 0..1. */
  e: number;
  direction: TransitionDirection;
  /** wipe edge softness (fraction of the frame, 0..0.5). */
  softness: number;
  /** zoom factor (1.2..4) or glitch strength (0..1). */
  amount: number;
  /** The project frame index (the glitch hash seed). */
  frame: number;
}

/** The direction a wipe edge / slide / push travels, in frame coordinates (y down). */
export const TRAVEL: Record<TransitionDirection, [number, number]> = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
/** Glitch: block grid, row count and hash salts (the shader uses the same numbers). */
export const GLITCH = { cols: 16, rows: 12, lines: 48, blockSalt: 7919, rowSalt: 104729, shift: 0.1, split: 0.02 } as const;

const mix = (a: Pixel, b: Pixel, w: number): Pixel => a.map((v, k) => v * (1 - w) + b[k] * w) as Pixel;
const over = (top: Pixel, under: Pixel): Pixel => top.map((v, k) => v + under[k] * (1 - top[3])) as Pixel;
export const smoothstep = (lo: number, hi: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - lo) / (hi - lo)));
  return t * t * (3 - 2 * t);
};

/** The weight of the incoming picture at (x, y) for a wipe. */
function wipeWeight(prm: TransitionParams, x: number, y: number): number {
  const [dx, dy] = TRAVEL[prm.direction];
  const q = (x - 0.5) * dx + (y - 0.5) * dy + 0.5;
  const s = prm.softness;
  const c = -s + prm.e * (1 + 2 * s);
  return s < 1e-6 ? (q < c ? 1 : 0) : 1 - smoothstep(c - s, c + s, q);
}

function glitch(prm: TransitionParams, a: Sampler, b: Sampler, x: number, y: number): Pixel {
  const { e, frame, amount } = prm;
  const bx = Math.floor(x * GLITCH.cols);
  const by = Math.floor(y * GLITCH.rows);
  const hit = grainHash(frame, bx, by + GLITCH.blockSalt) < e;
  const line = Math.floor(y * GLITCH.lines);
  const s = Math.sin(Math.PI * e) * amount;
  const shift = (grainHash(frame, line, GLITCH.rowSalt) - 0.5) * GLITCH.shift * s;
  const k = GLITCH.split * s;
  const at = (dx: number): Pixel => (hit ? b(x + shift + dx, y) : a(x + shift + dx, y));
  const g = at(0);
  return [at(k)[0], g[1], at(-k)[2], g[3]];
}

/** The transition's premultiplied pixel at (x, y); 'audio' (no picture) behaves as a dissolve. */
export function transitionPixel(prm: TransitionParams, a: Sampler, b: Sampler, x: number, y: number): Pixel {
  const { e } = prm;
  const [tx, ty] = TRAVEL[prm.direction];
  switch (prm.type) {
    case 'dip': {
      const p = e < 0.5 ? a(x, y) : b(x, y);
      const k = e < 0.5 ? 1 - 2 * e : 2 * e - 1;
      return [p[0] * k, p[1] * k, p[2] * k, p[3]];
    }
    case 'wipe': return mix(a(x, y), b(x, y), wipeWeight(prm, x, y));
    case 'slide': return over(b(x + tx * (1 - e), y + ty * (1 - e)), a(x, y));
    case 'push': return over(b(x + tx * (1 - e), y + ty * (1 - e)), a(x - tx * e, y - ty * e));
    case 'zoom': {
      const sA = 1 + (prm.amount - 1) * e;
      const sB = prm.amount ** (e - 1);
      const w = smoothstep(0.35, 0.65, e);
      return mix(a(0.5 + (x - 0.5) / sA, 0.5 + (y - 0.5) / sA), b(0.5 + (x - 0.5) / sB, 0.5 + (y - 0.5) / sB), w);
    }
    case 'glitch': return glitch(prm, a, b, x, y);
    default: return mix(a(x, y), b(x, y), e);
  }
}
