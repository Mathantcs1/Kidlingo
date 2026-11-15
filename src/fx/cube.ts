// Pure parser for Adobe/Resolve `.cube` 3D LUT files (Plan 4 E8). 1D LUTs are refused with a plain message.

export type CubeResult =
  | { ok: true; size: number; data: Float32Array; domainMin: [number, number, number]; domainMax: [number, number, number]; title?: string }
  | { ok: false; reason: string };

export const MIN_CUBE_SIZE = 2;
export const MAX_CUBE_SIZE = 65;

type V3 = [number, number, number];

function triple(parts: string[]): V3 | null {
  if (parts.length !== 3) return null;
  const v = parts.map(Number);
  return v.every(Number.isFinite) ? (v as V3) : null;
}

const fail = (reason: string): CubeResult => ({ ok: false, reason });

/** `data` holds size³ RGB triples with red varying fastest (the `.cube` order). */
export function parseCube(text: string): CubeResult {
  let size = 0;
  let title: string | undefined;
  let domainMin: V3 = [0, 0, 0];
  let domainMax: V3 = [1, 1, 1];
  let data: Float32Array | null = null;
  let rows = 0;
  let expected = 0;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const first = line.charCodeAt(0);
    const isData = (first >= 48 && first <= 57) || first === 45 || first === 43 || first === 46 || line.startsWith('NaN') || line.startsWith('nan');
    if (!isData) {
      const [word, ...rest] = line.split(/\s+/);
      if (word === 'TITLE') title = line.slice(5).trim().replace(/^"|"$/g, '');
      else if (word === 'LUT_1D_SIZE') return fail('This is a 1D LUT; only 3D .cube LUTs (LUT_3D_SIZE) are supported');
      else if (word === 'LUT_3D_SIZE') {
        size = Number(rest[0]);
        if (!Number.isInteger(size) || size < MIN_CUBE_SIZE || size > MAX_CUBE_SIZE) return fail(`LUT size must be between ${MIN_CUBE_SIZE} and ${MAX_CUBE_SIZE}`);
        expected = size ** 3;
        data = new Float32Array(expected * 3);
      } else if (word === 'DOMAIN_MIN' || word === 'DOMAIN_MAX') {
        const v = triple(rest);
        if (!v) return fail(`${word} needs three numbers`);
        if (word === 'DOMAIN_MIN') domainMin = v;
        else domainMax = v;
      }
      continue;
    }
    if (!data) return fail('LUT_3D_SIZE must come before the colour rows');
    if (rows >= expected) return fail(`Expected ${expected} rows but found more`);
    const v = triple(line.split(/\s+/));
    if (!v) return fail(`Row ${rows + 1} is not three numbers`);
    data[rows * 3] = v[0];
    data[rows * 3 + 1] = v[1];
    data[rows * 3 + 2] = v[2];
    rows++;
  }
  if (!data) return fail('Not a 3D .cube file (LUT_3D_SIZE is missing)');
  if (rows !== expected) return fail(`Expected ${expected} rows but found ${rows}`);
  if (domainMin.some((lo, i) => !(lo < domainMax[i]))) return fail('The LUT domain is empty (DOMAIN_MIN must be below DOMAIN_MAX)');
  return { ok: true, size, data, domainMin, domainMax, ...(title ? { title } : {}) };
}
