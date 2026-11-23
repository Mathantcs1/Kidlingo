// Named cameras for the script's cam= directive. Coordinates are relative to the subject at the origin (z toward the camera).
import { pushIn } from './camera.js';

const MOVES = {
  wide: { from: { pos: [0.5, 1.5, 7.6], fov: 52 }, to: { pos: [0.1, 1.35, 4.8], fov: 50 }, at: [-0.2, 0.75, 0] },
  push: { from: { pos: [0.3, 1.5, 6.0], fov: 50 }, to: { pos: [0.0, 1.45, 4.2], fov: 48 }, at: [0, 1.0, 0] },
  face: { from: { pos: [0.25, 1.85, 2.7], fov: 40 }, to: { pos: [0.1, 1.85, 2.3], fov: 38 }, at: [0, 1.7, 0] },   // whole head in frame, chin above the caption band
  high: { from: { pos: [4.2, 3.6, 6.5], fov: 58 }, to: { pos: [3.6, 3.3, 5.6], fov: 54 }, at: [0, 0.9, 0] },
  low:  { from: { pos: [0.7, 0.35, 4.6], fov: 56 }, to: { pos: [0.3, 0.55, 3.2], fov: 52 }, at: [0, 1.5, 0] },
};
export const CAM_NAMES = Object.keys(MOVES);

/** → { cam: (t) => {pos, fov}, at: [x,y,z] } for a shot spanning [t0,t1]. */
export function cameraFor(name, t0, t1) {
  const m = MOVES[name];
  if (!m) throw new Error(`unknown cam "${name}" (use ${CAM_NAMES.join(', ')})`);
  return { cam: pushIn({ from: m.from, to: m.to, t0, t1 }), at: m.at };
}

/** Where a world point (0, y, 0) lands vertically in the frame for a pose looking at `at`: 0 = top edge, 1 = bottom edge (pinhole, vertical fov). */
export function projectFrameY(pose, at, y) {
  const sub = (p, q) => p.map((v, i) => v - q[i]), dot = (p, q) => p.reduce((s, v, i) => s + v * q[i], 0);
  const unit = v => { const l = Math.hypot(...v); return v.map(x => x / l); };
  const f = unit(sub(at, pose.pos)), v = sub([0, y, 0], pose.pos), up0 = [0, 1, 0];
  const up = unit(sub(up0, f.map(x => x * dot(up0, f))));
  return (1 - dot(v, up) / (dot(v, f) * Math.tan(pose.fov * Math.PI / 360))) / 2;
}
