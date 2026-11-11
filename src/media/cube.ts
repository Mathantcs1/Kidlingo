// Pure parser of Adobe/Resolve `.cube` 3D LUT files (Plan 4 D5). No DOM; the messages are shown to the user.

export type Vec3 = [number, number, number];

export interface CubeLut {
  /** Points per side (2..65). */
  size: number;
  /** size³ RGB triples in file order: red changes fastest, then green, then blue. */
  data: Float32Array;
  /** The input range: a colour c maps to lattice coordinates (c − domainMin) / (domainMax − domainMin). */
  domainMin: Vec3;
  domainMax: Vec3;
  title?: string;
}

/** A .cube file ClipForge cannot use; `message` is plain English for the user. */
export class CubeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CubeError';
  }
}

/** The notice when a clip's LUT cannot be used at render time (shown once per LUT media and compositor). */
export function lutUnavailableMessage(name: string): string {
  return `The LUT "${name}" could not be loaded, so its effect is skipped.`;
}

export const MIN_CUBE_SIZE = 2;
export const MAX_CUBE_SIZE = 65;
/** Larger files are refused before they are read (a 65³ LUT is about 8 MB of text). */
export const MAX_CUBE_BYTES = 40 * 1024 * 1024;

export function assertCubeBytes(bytes: number): void {
  if (bytes > MAX_CUBE_BYTES) throw new CubeError('This .cube file is too large (over 40 MB) to be a LUT ClipForge can use.');
}

const QUOTE_MAX = 40;

/**
 * File text safe to put in a message: control and replacement characters removed, at most 40 characters (then '…'),
 * so a binary or one-line 40 MB file never produces a huge or garbled toast.
 */
export function quoteLine(line: string): string {
  const head = line.slice(0, QUOTE_MAX * 4).replace(/[\p{Cc}\ufffd]/gu, '');
  return head.length > QUOTE_MAX ? `${head.slice(0, QUOTE_MAX)}…` : head;
}

const NUMBER = /^[-+]?(\d+\.?\d*|\.\d+)([eE][-+]?\d+)?$/;
const KEYWORD = /^[A-Z][A-Z0-9_]*$/;

/** The finite numbers of `tokens`, or null when any is not a plain finite number. */
function numbers(tokens: string[]): number[] | null {
  const out = tokens.map((t) => (NUMBER.test(t) ? Number(t) : Number.NaN));
  return out.every(Number.isFinite) ? out : null;
}

function triple(keyword: string, tokens: string[]): Vec3 {
  const v = numbers(tokens);
  if (!v || v.length !== 3) throw new CubeError(`The ${keyword} line of this .cube file is not three numbers.`);
  return [v[0], v[1], v[2]];
}

function sizeOf(tokens: string[]): number {
  const v = numbers(tokens);
  if (!v || v.length !== 1 || !Number.isInteger(v[0])) throw new CubeError('The LUT_3D_SIZE line of this .cube file is not a whole number.');
  const n = v[0];
  if (n < MIN_CUBE_SIZE || n > MAX_CUBE_SIZE) {
    throw new CubeError(`This LUT has ${n} points per side. ClipForge supports 3D LUTs with ${MIN_CUBE_SIZE} to ${MAX_CUBE_SIZE} points per side.`);
  }
  return n;
}

/**
 * Parses a 3D `.cube` LUT. Tolerates CRLF, `#` comments (whole-line or trailing), blank lines, `TITLE "…"`, and
 * unknown keywords before the colour rows; honours DOMAIN_MIN/DOMAIN_MAX and LUT_3D_INPUT_RANGE. Throws CubeError
 * for a 1D LUT, a missing or out-of-range size, a bad domain, a malformed or non-finite row, or the wrong row count.
 */
export function parseCube(text: string): CubeLut {
  assertCubeBytes(text.length);
  let size = 0;
  let title: string | undefined;
  let domainMin: Vec3 = [0, 0, 0];
  let domainMax: Vec3 = [1, 1, 1];
  let data: Float32Array | null = null;
  let rows = 0;
  const lines = text.split(/\r\n|\r|\n/);
  for (const [i, raw] of lines.entries()) {
    // TITLE first: its quoted text may contain '#', which elsewhere starts a comment.
    const title0 = rows === 0 ? /^\s*TITLE(?=\s|$)(?:\s+(?:"([^"]*)"|([^#]*)))?/.exec(raw) : null;
    if (title0) {
      title = (title0[1] ?? title0[2] ?? '').trim() || undefined;
      continue;
    }
    const hash = raw.indexOf('#');
    const line = (hash >= 0 ? raw.slice(0, hash) : raw).trim();
    if (line === '') continue;
    const tokens = line.split(/\s+/);
    const head = tokens[0];
    if (rows === 0 && KEYWORD.test(head)) {
      const rest = tokens.slice(1);
      if (head === 'LUT_1D_SIZE') throw new CubeError('This is a 1D LUT. ClipForge only supports 3D LUTs (.cube files with a LUT_3D_SIZE line).');
      if (head === 'LUT_3D_SIZE') size = sizeOf(rest);
      else if (head === 'DOMAIN_MIN') domainMin = triple(head, rest);
      else if (head === 'DOMAIN_MAX') domainMax = triple(head, rest);
      else if (head === 'LUT_3D_INPUT_RANGE') {
        const v = numbers(rest);
        if (!v || v.length !== 2) throw new CubeError('The LUT_3D_INPUT_RANGE line of this .cube file is not two numbers.');
        domainMin = [v[0], v[0], v[0]];
        domainMax = [v[1], v[1], v[1]];
      }
      continue;
    }
    const v = tokens.length === 3 ? numbers(tokens) : null;
    if (!v) throw new CubeError(`Line ${i + 1} of this .cube file is not three numbers: "${quoteLine(line)}".`);
    if (size === 0) {
      if (lines.some((l, j) => j > i && /^\s*LUT_3D_SIZE\b/.test(l))) throw new CubeError('The LUT_3D_SIZE line must come before the colour rows.');
      break;
    }
    data ??= new Float32Array(size ** 3 * 3);
    if (rows < size ** 3) data.set(v, rows * 3);
    rows++;
  }
  if (size === 0) throw new CubeError('This .cube file has no LUT_3D_SIZE line, so it is not a 3D LUT ClipForge can read.');
  if (rows !== size ** 3) {
    throw new CubeError(`This .cube file should have ${size ** 3} colour rows for its size (${size}) but has ${rows}.`);
  }
  if (domainMin.some((m, k) => !(m < domainMax[k]))) {
    throw new CubeError('DOMAIN_MIN must be below DOMAIN_MAX for every channel in this .cube file.');
  }
  return { size, data: data ?? new Float32Array(0), domainMin, domainMax, ...(title ? { title } : {}) };
}
