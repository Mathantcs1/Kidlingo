// Camera-operator physics: organic handheld noise, a critically damped follower (the camera lags its subject, never overshoots),
// and a move curve that accelerates and settles with a hair of overshoot, the way a real operator lands a push-in. All pure.
const hash = n => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const vnoise = (x, seed) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), a = hash(i * 1.7 + seed * 17.3) * 2 - 1, b = hash((i + 1) * 1.7 + seed * 17.3) * 2 - 1; return a + (b - a) * u; };

/** Smooth aperiodic noise in [-1, 1]: three octaves, so handheld drifts and trembles instead of swaying like a sine. */
export const fbm = (t, seed = 1) => vnoise(t * 0.9, seed) * 0.6 + vnoise(t * 2.1 + 10, seed + 1) * 0.3 + vnoise(t * 4.7 + 20, seed + 2) * 0.1;

/** Value of a critically damped spring chasing target(t), starting at rest on target(t0). freq ≈ how quickly it catches up (rad/s-ish). */
export function springFollow(target, t0, t, { freq = 3 } = {}) {
  let x = target(t0), v = 0;
  if (t <= t0) return x;
  const dt = 1 / 120, w = freq * 2;
  for (let s = t0; s < t - 1e-9; s += dt) {
    const h = Math.min(dt, t - s), T = target(s), e = x - T, c = v + w * e, k = Math.exp(-w * h);   // exact solution for a constant target over h
    x = T + (e + c * h) * k; v = (c - w * (e + c * h)) * k;
  }
  return x;
}

/** 0→1 with a slow start and a small overshoot (~4 %) before settling on 1. */
export const easeSettle = u => { u = Math.min(1, Math.max(0, u)); return u * u * (3 - 2 * u) + 0.22 * u * Math.sin(Math.PI * u); };
