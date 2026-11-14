// The spring ease (data v7, Plan 5B D5): a damped harmonic oscillator released at rest from 0 towards 1, evaluated in
// CLOSED FORM in physical seconds (no integration, so no frame-rate dependent drift between preview and export).
// Pure, allocation-free, deterministic.
import type { SpringParams } from './easing';

/** The spring presets offered by the ease editor (5B Task 8 chips `ease-spring-<key>`). */
export const SPRING_PRESETS: readonly { key: 'gentle' | 'snappy' | 'bouncy' | 'wobbly'; label: string; spring: Readonly<SpringParams> }[] = [
  { key: 'gentle', label: 'Gentle', spring: { stiffness: 120, damping: 14, mass: 1 } },
  { key: 'snappy', label: 'Snappy', spring: { stiffness: 170, damping: 26, mass: 1 } },
  { key: 'bouncy', label: 'Bouncy', spring: { stiffness: 180, damping: 12, mass: 1 } },
  { key: 'wobbly', label: 'Wobbly', spring: { stiffness: 180, damping: 8, mass: 1 } },
];

/** Above this `w·tau` the over-damped branch switches from cosh/sinh (overflow) to the two-exponential form. */
const HYPERBOLIC_LIMIT = 20;

/**
 * The spring's position at `tau` seconds after release: x(0) = 0 exactly, x'(0) = 0, x → 1. With ω0 = √(k/m) and
 * ζ = c / (2√(km)), a = ζ·ω0: under-damped (ζ < 1) 1 − e^(−a·τ)(cos wτ + a·sin(wτ)/w), w = ω0√(1 − ζ²); critically
 * damped (ζ = 1) 1 − e^(−a·τ)(1 + a·τ); over-damped (ζ > 1) the same with cosh/sinh, w = ω0√(ζ² − 1). sin(wτ)/w and
 * sinh(wτ)/w both tend to τ as w → 0, so the three branches meet continuously at ζ = 1. Damping 0 stays in [0, 2].
 */
export function springAt(s: SpringParams, tau: number): number {
  if (!(tau > 0)) return 0;
  const w0 = Math.sqrt(s.stiffness / s.mass);
  const zeta = s.damping / (2 * Math.sqrt(s.stiffness * s.mass));
  const a = zeta * w0;
  const d = zeta * zeta - 1;
  if (d < 0) {
    const w = w0 * Math.sqrt(-d);
    return 1 - Math.exp(-a * tau) * (Math.cos(w * tau) + (a * Math.sin(w * tau)) / w);
  }
  if (d === 0) return 1 - Math.exp(-a * tau) * (1 + a * tau);
  const w = w0 * Math.sqrt(d);
  if (w * tau < HYPERBOLIC_LIMIT) return 1 - Math.exp(-a * tau) * (Math.cosh(w * tau) + (a * Math.sinh(w * tau)) / w);
  // e^(−aτ)(cosh wτ + (a/w) sinh wτ) as two exponentials (both exponents ≤ 0 since w < a): no overflow for long segments.
  return 1 - 0.5 * ((1 + a / w) * Math.exp((w - a) * tau) + (1 - a / w) * Math.exp(-(w + a) * tau));
}

/**
 * The spring as an ease over a segment of `seconds` (D5): x(u·S) − u·x(S) + u, i.e. the physical motion plus a linear
 * endpoint correction u·(1 − x(S)), so the result is EXACTLY 0 at u = 0 and EXACTLY 1 at u = 1 (x(S) − x(S) = 0) and
 * continuous; the correction is tiny once the spring has settled by the segment end. A non-positive or non-finite
 * `seconds` reads as 1. `u` is not clamped here (easeAt clamps it).
 */
export function springEase(s: SpringParams, u: number, seconds: number): number {
  const S = seconds > 0 && Number.isFinite(seconds) ? seconds : 1;
  return springAt(s, u * S) - u * springAt(s, S) + u;
}

/**
 * How far the spring is from rest at the end of a `seconds` segment, |1 − x(S)| (the ease editor's "does not settle"
 * note). Never NaN (P5B-3): infinite time settles any damped spring (0) but not an undamped one (1, it oscillates
 * forever, where cos(∞) would be NaN); other invalid seconds read as 1 like springEase.
 */
export function springResidual(s: SpringParams, seconds: number): number {
  if (seconds === Infinity) return s.damping > 0 ? 0 : 1;
  const r = Math.abs(1 - springAt(s, seconds > 0 && Number.isFinite(seconds) ? seconds : 1));
  return Number.isFinite(r) ? r : 1;
}
