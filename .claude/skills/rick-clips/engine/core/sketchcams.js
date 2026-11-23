// Named cinematic 2.5D cameras for the sketch style: {x, y, zoom, roll, vertigo, blur, focus} over a shot. subject = {u, v, depth}.
// Every move really moves (tested). frame = 'left' | 'right' | 'center' puts the subject on a third instead of the middle.
import { aimCamera } from './layers.js';
import { fbm, springFollow, easeSettle } from './camnoise.js';
export const SKETCH_CAM_NAMES = ['wide', 'push', 'pull', 'face', 'high', 'low', 'truck', 'crane', 'fly', 'dutch', 'orbit', 'vertigo', 'tiltup', 'spiral', 'whip', 'crash', 'drift', 'reveal', 'follow', 'ecu'];
/** Shot size of each camera (what the framing ends up being), for the storyboard's coverage check. */
export const SHOT_SIZE = { wide: 'wide', high: 'wide', crane: 'wide', tiltup: 'wide', truck: 'medium', push: 'medium', pull: 'medium', orbit: 'medium', follow: 'medium', drift: 'medium', reveal: 'medium', vertigo: 'medium', low: 'medium', whip: 'medium', dutch: 'close', face: 'close', crash: 'close', spiral: 'close', fly: 'close', ecu: 'extreme' };
const lerp = (a, b, k) => a + (b - a) * k, clamp01 = x => Math.min(1, Math.max(0, x)), ss = x => x * x * (3 - 2 * x);

export function sketchCam(name, { t0, t1, subject, size, frame = 'center' }) {
  if (!SKETCH_CAM_NAMES.includes(name)) throw new Error(`unknown cam "${name}" (use ${SKETCH_CAM_NAMES.join(', ')})`);
  const S = typeof subject === 'function' ? subject : () => subject;   // the subject may move: follow tracks it
  const { W, H } = size, d = S(t0).depth, ox = frame === 'left' ? -0.22 * W : frame === 'right' ? 0.22 * W : 0;
  return t => {
    const u = clamp01((t - t0) / (t1 - t0)), ks = ss(u), k = easeSettle(u), steady = d, subj = S(t);   // ks: stately (truck, crane); k: lands with a settle (push, face)
    const soft = t1 - t0 >= 1.6 ? 0.45 : t1 - t0 >= 1.0 ? 0.08 : 0;   // only long shots start soft: a fast cut must land SHARP
    const rack = steady - soft * (1 - ss(clamp01((t - t0) / (0.4 * (t1 - t0)))));   // close-ups pull focus onto the subject
    const aim = (z, amount = 1, sj = subj) => { const a = aimCamera(sj, z, d, { ox: ox * amount, oy: 0 }); return { x: a.x * amount, y: a.y * amount }; };
    let z, a = { x: 0, y: 0 }, x = 0, y = 0, roll = 0, vertigo = 0, blur = 0, focus = steady;
    switch (name) {
      case 'wide': z = lerp(1, 1.25, ks); x = lerp(0, 0.07 * W, ks); break;
      case 'push': z = lerp(1.1, 2.0, k); a = aim(z, 0.85 * k + 0.1); focus = rack; break;
      case 'pull': z = lerp(2.1, 1.1, k); a = aim(z, 1 - 0.9 * k); break;
      case 'face': z = lerp(2.0, 2.6, k); a = aim(z); focus = rack; break;
      case 'high': z = lerp(1.2, 1.45, ks); x = lerp(-0.05 * W, 0.05 * W, ks); y = lerp(0.16 * H, 0.02 * H, ks); break;
      case 'low': z = lerp(1.3, 1.8, k); a = aim(z, 0.5); y = -0.1 * H; focus = rack; break;
      case 'truck': z = 1.45; x = lerp(-0.2 * W, 0.2 * W, ks); y = 0.02 * H; break;                      // lateral dolly: near planes sweep past the far ones
      case 'crane': z = 1.35; y = lerp(0.2 * H, -0.15 * H, ks); x = lerp(0.03 * W, -0.03 * W, ks); break;  // rises over the scene
      case 'fly': { const e = u * u * (3 - 2 * u); z = lerp(1, 3.2, e); a = aim(z, 0.9 * e); focus = steady - 0.3 * (1 - e); break; }
      case 'orbit': z = lerp(1.5, 1.85, k); a = aim(z, 0.9); x = 0.16 * W * Math.sin(lerp(-1.2, 1.2, k)); roll = 0.05 * Math.sin(lerp(-1.2, 1.2, k)); break;   // arcs around the subject
      case 'vertigo': z = lerp(1.4, 1.9, k); a = aim(z, 0.8); vertigo = lerp(0, 0.7, k); break;          // dolly-zoom: the world stretches behind the subject
      case 'tiltup': z = lerp(1.3, 1.15, ks); y = lerp(0.22 * H, -0.22 * H, ks); break;                    // from the ground up to the sky
      case 'spiral': z = lerp(1.2, 2.2, k); a = aim(z, 0.7); roll = lerp(-0.15, 0.2, k); break;
      case 'crash': { const e = 1 - Math.pow(1 - Math.min(1, u / 0.2), 3); z = 1 + 0.95 * e + 0.25 * u; a = aim(z, 0.85); focus = rack; break; }   // punch-in on a beat, then a slow creep
      case 'ecu': z = lerp(3.0, 3.4, k); a = aim(z, 1); focus = rack; break;                                   // extreme close-up
      case 'drift': z = lerp(1.15, 1.32, ks); x = 0.05 * W * fbm(t * 0.5, 7); y = 0.03 * H * fbm(t * 0.5, 8); break;   // steadicam float
      case 'reveal': z = 1.3; x = lerp(-0.3 * W, 0.1 * W, ks); focus = u >= 0.6 ? steady : lerp(1.1, steady, ss(u / 0.6)); break;   // foreground slides away, focus pulls onto the subject
      case 'follow': { const sm = { ...subj, u: springFollow(tt => S(tt).u, t0, t, { freq: 1.3 }), v: springFollow(tt => S(tt).v, t0, t, { freq: 1.3 }) }; z = lerp(1.45, 1.6, ks); a = aim(z, 0.8, sm); x = lerp(-0.06 * W, 0.06 * W, ks); break; }   // tracking shot with operator lag
      case 'whip': { const e = u * u * u; z = 1.3; x = lerp(-0.5 * W, 0.5 * W, e); blur = 5 * Math.sin(Math.PI * u); break; }   // fast lateral whip pan with motion blur
      default: z = lerp(1.5, 2.0, k); a = aim(z, 0.6); roll = lerp(-0.09, 0.06, k); focus = rack;         // dutch: tilted, pushing in
    }
    return { x: x + a.x, y: y + a.y, zoom: z, roll, vertigo, blur, focus };
  };
}
