// Keyframes through a format switch (Plan 5 D9): position and scale keys follow the static fields. Pure.
import type { Clip } from './model';

/** Whether the clip has position or scale keys: such a clip is always customised (never refit, Plan 5 D9). */
export const hasFramingKeys = (c: Clip): boolean => (c.keys?.position?.length ?? 0) > 0 || (c.keys?.scale?.length ?? 0) > 0;

/**
 * Position keys scaled like x/y (·rx, ·ry) and, when `k` is given, scale keys like scale (·k, an unusable result keeps
 * the key's value), exactly as the static fields, so a format round trip restores them (Ruling J). Rotation, opacity
 * and effect keys are untouched; a clip without framing keys comes back as-is.
 */
export function scaleFramingKeys(c: Clip, rx: number, ry: number, k?: number): Clip {
  if (!hasFramingKeys(c)) return c;
  const keys = { ...c.keys };
  if (keys.position) keys.position = keys.position.map((q) => ({ ...q, x: q.x * rx, y: q.y * ry }));
  if (keys.scale && k !== undefined) {
    keys.scale = keys.scale.map((q) => {
      const v = q.v * k;
      return { ...q, v: Number.isFinite(v) && v >= 0 ? v : q.v };
    });
  }
  return { ...c, keys };
}
