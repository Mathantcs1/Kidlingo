// One-click looks (Plan 4 E7): data tables interpolated toward neutral by intensity. One `look` effect, one shader pass.
export const LOOK_KEYS = [
  'cinematic', 'moody', 'goldenHour', 'tealOrange', 'fashion', 'cleanVlog', 'film35', 'cyberpunk', 'dreamy',
] as const;
export type LookKey = (typeof LOOK_KEYS)[number];

type V3 = [number, number, number];

/** Grade applied per channel: gain, then lift, gamma, contrast, saturation, fade; vignette/grain are amounts 0..1. */
export interface LookDef {
  label: string;
  lift: V3;
  gamma: V3;
  gain: V3;
  saturation: number;
  contrast: number;
  fade: number;
  vignette: number;
  grain: number;
}

export const NEUTRAL_LOOK: Omit<LookDef, 'label'> = {
  lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1, 1, 1], saturation: 1, contrast: 1, fade: 0, vignette: 0, grain: 0,
};

export const LOOKS: Record<LookKey, LookDef> = {
  cinematic: { label: 'Cinematic', lift: [-0.02, 0, 0.03], gamma: [1, 1, 1], gain: [1.05, 1, 0.95], saturation: 0.92, contrast: 1.12, fade: 0.03, vignette: 0.3, grain: 0 },
  moody: { label: 'Moody', lift: [0, 0.01, 0.03], gamma: [0.8, 0.82, 0.85], gain: [0.95, 0.97, 1], saturation: 0.75, contrast: 1.15, fade: 0.02, vignette: 0.45, grain: 0 },
  goldenHour: { label: 'Golden Hour', lift: [0.01, 0, -0.02], gamma: [1.05, 1, 0.92], gain: [1.12, 1.03, 0.82], saturation: 1.1, contrast: 1.05, fade: 0, vignette: 0.2, grain: 0 },
  tealOrange: { label: 'Teal-Orange', lift: [-0.04, 0.01, 0.05], gamma: [1, 1, 1], gain: [1.12, 1, 0.88], saturation: 1.15, contrast: 1.1, fade: 0.02, vignette: 0, grain: 0 },
  fashion: { label: 'Fashion', lift: [0, 0, 0], gamma: [1, 1, 1], gain: [1.03, 1, 1], saturation: 0.85, contrast: 1.15, fade: 0.02, vignette: 0.15, grain: 0 },
  cleanVlog: { label: 'Clean Vlog', lift: [0, 0, 0], gamma: [1.08, 1.08, 1.08], gain: [1.02, 1.02, 1], saturation: 1.1, contrast: 1.05, fade: 0, vignette: 0, grain: 0 },
  film35: { label: 'Film 35mm', lift: [0.02, 0.01, -0.01], gamma: [1, 1, 1], gain: [1.04, 1, 0.94], saturation: 0.9, contrast: 1.08, fade: 0.05, vignette: 0.25, grain: 0.35 },
  cyberpunk: { label: 'Cyberpunk', lift: [0.03, -0.01, 0.06], gamma: [1, 1, 1], gain: [1.1, 0.9, 1.15], saturation: 1.35, contrast: 1.2, fade: 0, vignette: 0.2, grain: 0 },
  dreamy: { label: 'Dreamy', lift: [0.03, 0.03, 0.04], gamma: [1.1, 1.1, 1.1], gain: [1, 0.99, 1.02], saturation: 1.05, contrast: 0.9, fade: 0.12, vignette: 0, grain: 0 },
};

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** The look's grade at `intensity` 0..1: every field moved from neutral toward the preset. */
export function lookParams(key: LookKey, intensity: number): Omit<LookDef, 'label'> {
  const t = Math.min(1, Math.max(0, intensity));
  const d = LOOKS[key];
  const z = NEUTRAL_LOOK;
  return {
    lift: lerp3(z.lift, d.lift, t), gamma: lerp3(z.gamma, d.gamma, t), gain: lerp3(z.gain, d.gain, t),
    saturation: lerp(z.saturation, d.saturation, t), contrast: lerp(z.contrast, d.contrast, t),
    fade: lerp(z.fade, d.fade, t), vignette: lerp(z.vignette, d.vignette, t), grain: lerp(z.grain, d.grain, t),
  };
}
