// Pure geometry of the ease editor (Plan 5 Task 9): the SVG plot of one segment's eased progress. x is the time
// fraction [0, 1]; y is the progress [-1, 2] (overshoot allowed); the unit square sits inside the taller plot.
import { easeAt } from '../core/easing';
import type { Ease } from '../core/easing';

export type Bezier = [number, number, number, number];
export interface Handle {
  x: number;
  y: number;
}
/** SVG px per unit on each axis, and the margin around the plot. */
export interface Frame {
  sx: number;
  sy: number;
  pad: number;
}

export const FRAME: Frame = { sx: 160, sy: 80, pad: 18 };
export const Y_MIN = -1;
export const Y_MAX = 2;
export const viewSize = (f: Frame = FRAME): { w: number; h: number } => ({ w: f.sx + 2 * f.pad, h: (Y_MAX - Y_MIN) * f.sy + 2 * f.pad });

/** A linear segment as handles on the diagonal (any x = y pair is exactly linear). */
export const LINEAR_HANDLES: Bezier = [0.25, 0.25, 0.75, 0.75];
export const NUDGE = 0.01;
export const NUDGE_BIG = 0.1;

export const round3 = (v: number): number => Math.round(v * 1000) / 1000;
const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : v > 0 ? hi : lo);

/** A handle inside the legal range: x in [0, 1], y in [-1, 2] (non-finite values land on the nearest bound). */
export const clampHandle = (h: Handle): Handle => ({ x: clamp(h.x, 0, 1), y: clamp(h.y, Y_MIN, Y_MAX) });

export const toSvg = (h: Handle, f: Frame = FRAME): { px: number; py: number } => ({ px: f.pad + h.x * f.sx, py: f.pad + (Y_MAX - h.y) * f.sy });

/** The (clamped) handle under SVG point (px, py). */
export const fromSvg = (px: number, py: number, f: Frame = FRAME): Handle => clampHandle({ x: (px - f.pad) / f.sx, y: Y_MAX - (py - f.pad) / f.sy });

/** Client (page) coordinates to SVG user units, for an SVG whose viewBox is scaled to `rect`. */
export function clientToSvg(cx: number, cy: number, rect: { left: number; top: number; width: number; height: number }, f: Frame = FRAME): { px: number; py: number } {
  const v = viewSize(f);
  return { px: ((cx - rect.left) * v.w) / rect.width, py: ((cy - rect.top) * v.h) / rect.height };
}

/** The handle after an arrow key (0.01; 0.1 with shift), rounded so repeats never drift; null for other keys. Up raises y. */
export function nudgeHandle(h: Handle, key: string, big: boolean): Handle | null {
  const step = big ? NUDGE_BIG : NUDGE;
  const d = key === 'ArrowRight' ? [step, 0] : key === 'ArrowLeft' ? [-step, 0] : key === 'ArrowUp' ? [0, step] : key === 'ArrowDown' ? [0, -step] : null;
  if (!d) return null;
  return clampHandle({ x: round3(h.x + d[0]), y: round3(h.y + d[1]) });
}

export const withHandle = (b: Bezier, which: 1 | 2, h: Handle): Bezier => (which === 1 ? [h.x, h.y, b[2], b[3]] : [b[0], b[1], h.x, h.y]);

/** The two handles of an ease that is (or equals) a cubic Bézier; null for hold, back, elastic and bounce. */
export function bezierOf(e: Ease): Bezier | null {
  switch (e.kind) {
    case 'linear':
      return [...LINEAR_HANDLES];
    case 'easeIn':
      return [0.42, 0, 1, 1];
    case 'easeOut':
      return [0, 0, 0.58, 1];
    case 'easeInOut':
      return [0.42, 0, 0.58, 1];
    case 'bezier':
      return e.bezier ? [...e.bezier] : [...LINEAR_HANDLES];
    default:
      return null;
  }
}

/** The text of a numeric field as a finite number (a comma counts as a decimal point), else null. */
export function parseField(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

const num = (v: number): string => String(Math.round(v * 1000) / 1000);

/** The SVG path of the eased progress curve; `hold` is the step it really is (flat, then a jump at the next key). */
export function curvePath(e: Ease, f: Frame = FRAME, samples = 64): string {
  const at = (x: number, y: number): string => {
    const p = toSvg({ x, y }, f);
    return `${num(p.px)} ${num(p.py)}`;
  };
  const start = toSvg({ x: 0, y: 0 }, f);
  const end = toSvg({ x: 1, y: 1 }, f);
  if (e.kind === 'hold') return `M${num(start.px)} ${num(start.py)}H${num(end.px)}V${num(end.py)}`;
  const pts: string[] = [];
  for (let i = 0; i <= samples; i++) {
    const u = i / samples;
    pts.push(at(u, Math.min(Y_MAX, Math.max(Y_MIN, easeAt(e, u)))));
  }
  return `M${pts[0]}${pts.slice(1).map((p) => `L${p}`).join('')}`;
}
