// CPU reference of the LUT shader (shaders/lut.ts) and the maths both share: domain normalisation, the half-texel
// coordinate and GL's trilinear (LINEAR, CLAMP_TO_EDGE) lookup of a red-fastest lattice.

export type Vec3 = [number, number, number];

export interface LutData {
  size: number;
  /** size³ RGB triples, red fastest (texel (r, g, b) of a TEXTURE_3D of width = red, height = green, depth = blue). */
  data: ArrayLike<number>;
  domainMin: Vec3;
  domainMax: Vec3;
}

/** The shader uniforms of the domain: x = (c − min) · scale maps the domain onto 0..1. */
export function lutDomain(lut: Pick<LutData, 'domainMin' | 'domainMax'>): { min: Vec3; scale: Vec3 } {
  const scale = lut.domainMin.map((m, k) => 1 / (lut.domainMax[k] - m)) as Vec3;
  return { min: [...lut.domainMin], scale };
}

/**
 * The texture coordinate of normalised input x (0..1) in a LUT of n points: lattice point 0 is the CENTRE of the
 * first texel (0.5/n), lattice point n−1 the centre of the last ((n−0.5)/n). Without this correction a plain
 * `texture(lut, x)` would sample half a texel off at both ends and compress the grade.
 */
export function lutCoord(x: number, n: number): number {
  return (x * (n - 1) + 0.5) / n;
}

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

/** GL LINEAR filtering of one axis: the lower texel index and the weight of the upper one, for coordinate u. */
function axis(u: number, n: number): [number, number, number] {
  const t = Math.min(n - 1, Math.max(0, u * n - 0.5));
  const i0 = Math.min(n - 2, Math.floor(t));
  return [i0, i0 + 1, t - i0];
}

/** The lattice looked up trilinearly at normalised input x, exactly as texture() on the 3D texture does. */
export function lutSample(lut: LutData, x: Vec3): Vec3 {
  const n = lut.size;
  const [r0, r1, fr] = axis(lutCoord(x[0], n), n);
  const [g0, g1, fg] = axis(lutCoord(x[1], n), n);
  const [b0, b1, fb] = axis(lutCoord(x[2], n), n);
  const at = (r: number, g: number, b: number, k: number): number => lut.data[(r + n * (g + n * b)) * 3 + k];
  const out: Vec3 = [0, 0, 0];
  for (let k = 0; k < 3; k++) {
    const lerp = (a: number, b: number, f: number): number => a + (b - a) * f;
    const g0v = lerp(lerp(at(r0, g0, b0, k), at(r1, g0, b0, k), fr), lerp(at(r0, g1, b0, k), at(r1, g1, b0, k), fr), fg);
    const g1v = lerp(lerp(at(r0, g0, b1, k), at(r1, g0, b1, k), fr), lerp(at(r0, g1, b1, k), at(r1, g1, b1, k), fr), fg);
    out[k] = lerp(g0v, g1v, fb);
  }
  return out;
}

/**
 * The LUT effect on a STRAIGHT (un-premultiplied) colour 0..1: normalise by the domain (clamped), look the lattice up
 * trilinearly, then mix(original, graded, intensity), clamped to 0..1. The shader does the same between its
 * un-premultiply and re-premultiply.
 */
export function lutPixel(c: Vec3, lut: LutData, intensity: number): Vec3 {
  const { min, scale } = lutDomain(lut);
  const x = c.map((v, k) => clamp01((v - min[k]) * scale[k])) as Vec3;
  const g = lutSample(lut, x);
  return c.map((v, k) => clamp01(v + (g[k] - v) * intensity)) as Vec3;
}
