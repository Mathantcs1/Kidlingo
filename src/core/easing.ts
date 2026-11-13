import { cubicBezierAt } from './bezier';
import { springEase } from './spring';

export { cubicBezierAt };

export type EaseKind = 'linear' | 'hold' | 'easeIn' | 'easeOut' | 'easeInOut' | 'back' | 'elastic' | 'bounce' | 'bezier' | 'spring';

/** A damped spring (data v7, Plan 5B D5): stiffness 1..1000, damping 0..100, mass 0.1..10. */
export interface SpringParams {
  stiffness: number;
  damping: number;
  mass: number;
}

export interface Ease {
  kind: EaseKind;
  /** Only for 'bezier': [x1, y1, x2, y2] (x in [0, 1], y in [-1, 2]). */
  bezier?: [number, number, number, number];
  /** Only for 'spring' (stored data always carries it after repair; missing reads as SPRING_DEFAULT). */
  spring?: SpringParams;
}

/** Every stored ease kind (the ease editor offers 'spring' with its fields from 5B Task 8). */
export const EASE_KINDS: readonly EaseKind[] = ['linear', 'hold', 'easeIn', 'easeOut', 'easeInOut', 'back', 'elastic', 'bounce', 'bezier', 'spring'];

export const SPRING_DEFAULT: Readonly<SpringParams> = { stiffness: 170, damping: 26, mass: 1 };
export const SPRING_LIMITS: Readonly<Record<keyof SpringParams, readonly [number, number]>> = {
  stiffness: [1, 1000], damping: [0, 100], mass: [0.1, 10],
};

/** CSS cubic-bezier definitions of the three standard curves. */
export const EASE_PRESETS: Record<'easeIn' | 'easeOut' | 'easeInOut', [number, number, number, number]> = {
  easeIn: [0.42, 0, 1, 1],
  easeOut: [0, 0, 0.58, 1],
  easeInOut: [0.42, 0, 0.58, 1],
};

const BACK_C1 = 1.70158;
const BACK_C3 = BACK_C1 + 1;
const ELASTIC_C4 = (2 * Math.PI) / 3;

function bounceOut(u: number): number {
  const n = 7.5625;
  const d = 2.75;
  if (u < 1 / d) return n * u * u;
  if (u < 2 / d) return n * (u -= 1.5 / d) * u + 0.75;
  if (u < 2.5 / d) return n * (u -= 2.25 / d) * u + 0.9375;
  return n * (u -= 2.625 / d) * u + 0.984375;
}

/**
 * Eased progress for u in [0, 1] (clamped; NaN reads as 0). Exactly 0 at u = 0 and exactly 1 at u = 1 for every kind;
 * `hold` stays 0 until u = 1. `back`, `elastic`, `bounce` are the standard "out" variants; `back`, `elastic` and
 * `bezier` may leave [0, 1] in between (callers clamp to the property's legal range). `seconds` is the segment's
 * real duration (default 1); only `spring` reads it (D5: physical seconds, endpoint-corrected, may overshoot).
 */
export function easeAt(e: Ease, u: number, seconds = 1): number {
  if (!(u > 0)) return 0;
  if (u >= 1) return 1;
  switch (e.kind) {
    case 'hold':
      return 0;
    case 'easeIn':
    case 'easeOut':
    case 'easeInOut': {
      const p = EASE_PRESETS[e.kind];
      return cubicBezierAt(p[0], p[1], p[2], p[3], u);
    }
    case 'back': {
      const k = u - 1;
      return 1 + BACK_C3 * k * k * k + BACK_C1 * k * k;
    }
    case 'elastic':
      return Math.pow(2, -10 * u) * Math.sin((u * 10 - 0.75) * ELASTIC_C4) + 1;
    case 'bounce':
      return bounceOut(u);
    case 'bezier': {
      const b = e.bezier;
      return b ? cubicBezierAt(b[0], b[1], b[2], b[3], u) : u;
    }
    case 'spring':
      return springEase(e.spring ?? SPRING_DEFAULT, u, seconds);
    default:
      return u;
  }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Spring params from stored data: each non-finite or missing param => its default, finite ones clamped (D14). */
export function repairSpring(raw: unknown): SpringParams {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const one = (k: keyof SpringParams): number => {
    const v = r[k];
    const [lo, hi] = SPRING_LIMITS[k];
    return typeof v === 'number' && Number.isFinite(v) ? clamp(v, lo, hi) + 0 : SPRING_DEFAULT[k];
  };
  return { stiffness: one('stiffness'), damping: one('damping'), mass: one('mass') };
}

/**
 * Defensive parse of stored data: unknown kind, malformed or non-finite handles => linear; handles are clamped;
 * a spring always comes back with all three params (repairSpring).
 */
export function repairEase(raw: unknown): Ease {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { kind: 'linear' };
  const r = raw as { kind?: unknown; bezier?: unknown; spring?: unknown };
  if (typeof r.kind !== 'string' || !(EASE_KINDS as readonly string[]).includes(r.kind)) return { kind: 'linear' };
  if (r.kind === 'spring') return { kind: 'spring', spring: repairSpring(r.spring) };
  if (r.kind !== 'bezier') return { kind: r.kind as EaseKind };
  const h = r.bezier;
  if (!Array.isArray(h) || h.length !== 4 || !Array.from(h).every((n) => typeof n === 'number' && Number.isFinite(n))) {
    return { kind: 'linear' };
  }
  return {
    kind: 'bezier',
    bezier: [clamp(h[0], 0, 1), clamp(h[1], -1, 2), clamp(h[2], 0, 1), clamp(h[3], -1, 2)],
  };
}

export function isSameEase(a: Ease, b: Ease): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'spring') {
    const s = a.spring ?? SPRING_DEFAULT;
    const q = b.spring ?? SPRING_DEFAULT;
    return s.stiffness === q.stiffness && s.damping === q.damping && s.mass === q.mass;
  }
  if (a.kind !== 'bezier') return true;
  const x = a.bezier;
  const y = b.bezier;
  if (!x || !y) return !x && !y;
  return x[0] === y[0] && x[1] === y[1] && x[2] === y[2] && x[3] === y[3];
}
