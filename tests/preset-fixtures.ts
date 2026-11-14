// Shared fixtures for the preset maths tests (Plan 5B Task 5): the format, the identity offsets, a spread of eases
// (incl. overshooting beziers and springs), random params within the schema, and every preset x slot entry.
import type { Ease } from '../src/core/easing';
import type { MotionOffsets, MotionSlot, PresetKey } from '../src/core/motionTypes';
import { PRESET_KEYS, PRESET_SCHEMA } from '../src/core/presets';

export const F = { width: 1920, height: 1080 };
export const W = F.width;
export const H = F.height;
export const ID: MotionOffsets = { dx: 0, dy: 0, drot: 0, kScale: 1, kOpacity: 1 };
export const EASES: Ease[] = [
  { kind: 'linear' }, { kind: 'hold' }, { kind: 'easeIn' }, { kind: 'easeOut' }, { kind: 'easeInOut' }, { kind: 'back' },
  { kind: 'elastic' }, { kind: 'bounce' }, { kind: 'bezier', bezier: [0.3, -1, 0.7, 2] }, { kind: 'bezier', bezier: [0.36, 0, 0.66, -0.56] },
  { kind: 'spring', spring: { stiffness: 170, damping: 26, mass: 1 } }, { kind: 'spring', spring: { stiffness: 1000, damping: 0, mass: 0.1 } },
  { kind: 'spring', spring: { stiffness: 180, damping: 8, mass: 1 } },
];
export const randomEase = (r: () => number): Ease => {
  const e = EASES[Math.floor(r() * EASES.length)];
  if (e.kind === 'spring' && r() < 0.5) return { kind: 'spring', spring: { stiffness: 1 + r() * 999, damping: r() * 100, mass: 0.1 + r() * 9.9 } };
  if (e.kind === 'bezier' && r() < 0.5) return { kind: 'bezier', bezier: [r(), -1 + 3 * r(), r(), -1 + 3 * r()] };
  return e;
};
export const randomParams = (key: PresetKey, r: () => number): Record<string, number> => Object.fromEntries(PRESET_SCHEMA[key].params.map((d) => {
  const v = d.min + r() * (d.max - d.min);
  return [d.key, d.integer ? Math.round(v) : v];
}));
export const entries = (): [PresetKey, MotionSlot][] => PRESET_KEYS.flatMap((k) => PRESET_SCHEMA[k].slots.map((s): [PresetKey, MotionSlot] => [k, s]));
export const restP = (slot: MotionSlot): number[] => (slot === 'in' ? [1] : slot === 'out' ? [0] : slot === 'emphasis' ? [0, 1] : [0]);
export const finite = (o: MotionOffsets) => Object.values(o).every(Number.isFinite);
