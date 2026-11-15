// Small pure colour helpers shared by the CPU reference (reference.ts) and its tests. Values are 0..1 sRGB-encoded.
export type Rgb = [number, number, number];

export const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
export const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
export const luma709 = (c: Rgb): number => 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];

export const srgbToLinear = (v: number): number => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
export const linearToSrgb = (v: number): number => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

/** Rotates the colour about the grey axis (1,1,1) by `degrees` (Rodrigues rotation; red + 120° = green). */
export function hueRotate(c: Rgb, degrees: number): Rgb {
  const a = (degrees * Math.PI) / 180;
  const cos = Math.cos(a);
  const sin = Math.sin(a);
  const k = (1 - cos) / 3;
  const s = sin / Math.sqrt(3);
  const d = cos + k;
  const [r, g, b] = c;
  return [d * r + (k - s) * g + (k + s) * b, (k + s) * r + d * g + (k - s) * b, (k - s) * r + (k + s) * g + d * b];
}
