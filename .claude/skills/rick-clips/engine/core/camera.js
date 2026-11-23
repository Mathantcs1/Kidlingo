// Camera paths: pure functions of time returning {pos:[x,y,z], fov}.
const clamp01 = x => Math.min(1, Math.max(0, x));
export const smoothstep = x => x * x * (3 - 2 * x);
const lerp = (a, b, k) => a + (b - a) * k;
const lerpPose = (a, b, k) => ({ pos: a.pos.map((v, i) => lerp(v, b.pos[i], k)), fov: lerp(a.fov, b.fov, k) });

/** Slow push (or pull) from one pose to another over [t0,t1]; clamped outside. */
export function pushIn({ from, to, t0, t1, ease = smoothstep }) {
  return t => {
    const k = ease(clamp01((t - t0) / (t1 - t0)));
    if (k <= 0) return { pos: [...from.pos], fov: from.fov };
    if (k >= 1) return { pos: [...to.pos], fov: to.fov };
    return lerpPose(from, to, k);
  };
}

/** Travel through points (≥2) evenly over [t0,t1] with eased progress; clamped to the first/last point outside. */
export function flyThrough(points, t0, t1, ease = smoothstep) {
  const segs = points.length - 1;
  return t => {
    const u = clamp01((t - t0) / (t1 - t0));
    if (u <= 0) return { pos: [...points[0].pos], fov: points[0].fov };
    if (u >= 1) return { pos: [...points[segs].pos], fov: points[segs].fov };
    const s = ease(u) * segs, i = Math.min(segs - 1, Math.floor(s));
    return lerpPose(points[i], points[i + 1], s - i);
  };
}
