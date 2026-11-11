import { describe, expect, it } from 'vitest';
import { CubeError, MAX_CUBE_BYTES, assertCubeBytes, parseCube } from '../src/media/cube';

/** A .cube text of `size` with rows from `row(r, g, b)` (lattice indices), red fastest. */
function cube(size: number, row: (r: number, g: number, b: number) => number[], head = `LUT_3D_SIZE ${size}`): string {
  const lines = [head];
  for (let b = 0; b < size; b++) for (let g = 0; g < size; g++) for (let r = 0; r < size; r++) lines.push(row(r, g, b).join(' '));
  return lines.join('\n');
}
const identity = (size: number) => (r: number, g: number, b: number) => [r, g, b].map((v) => v / (size - 1));

function refusal(text: string): string {
  try {
    parseCube(text);
  } catch (e) {
    expect(e).toBeInstanceOf(CubeError);
    return (e as Error).message;
  }
  throw new Error('parseCube accepted the text');
}

describe('parseCube', () => {
  it('reads a size-2 identity cube exactly, red fastest, default domain 0..1', () => {
    const lut = parseCube(cube(2, identity(2)));
    expect(lut.size).toBe(2);
    expect([...lut.data]).toEqual([0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 1, 0, 0, 0, 1, 1, 0, 1, 0, 1, 1, 1, 1, 1]);
    expect(lut.domainMin).toEqual([0, 0, 0]);
    expect(lut.domainMax).toEqual([1, 1, 1]);
    expect(lut.title).toBeUndefined();
  });

  it('keeps the file row order (red fastest) for a non-symmetric cube', () => {
    const rows = [[0.1, 0.2, 0.3], [0.9, 0.05, 0], [0, 0.7, 0.1], [0.4, 0.4, 0.2], [0.2, 0.1, 0.8], [0.6, 0, 0.6], [0, 0.5, 0.9], [1, 0.95, 0.9]];
    const text = ['LUT_3D_SIZE 2', ...rows.map((r) => r.join(' '))].join('\n');
    const lut = parseCube(text);
    // Row 1 (second) is lattice (r=1, g=0, b=0); row 2 is (r=0, g=1, b=0); row 4 is (r=0, g=0, b=1).
    expect([...lut.data.slice(3, 6)].map((v) => +v.toFixed(5))).toEqual([0.9, 0.05, 0]);
    expect([...lut.data.slice(6, 9)].map((v) => +v.toFixed(5))).toEqual([0, 0.7, 0.1]);
    expect([...lut.data.slice(12, 15)].map((v) => +v.toFixed(5))).toEqual([0.2, 0.1, 0.8]);
  });

  it('tolerates CRLF, # comments (whole-line and trailing), blank lines, TITLE and leading spaces', () => {
    const body = cube(2, identity(2), '# made by hand\r\n\r\nTITLE "Warm Look"\r\n  LUT_3D_SIZE 2   # two points').replace(/\n/g, '\r\n');
    const lut = parseCube(`${body}\r\n\r\n# end\r\n`);
    expect(lut.title).toBe('Warm Look');
    expect(lut.size).toBe(2);
    expect(lut.data[3]).toBe(1);
  });

  it('honours DOMAIN_MIN / DOMAIN_MAX and LUT_3D_INPUT_RANGE', () => {
    const lut = parseCube(cube(2, identity(2), 'DOMAIN_MIN 0 -0.5 0.1\nDOMAIN_MAX 2 1.5 4\nLUT_3D_SIZE 2'));
    expect(lut.domainMin).toEqual([0, -0.5, 0.1]);
    expect(lut.domainMax).toEqual([2, 1.5, 4]);
    const range = parseCube(cube(2, identity(2), 'LUT_3D_INPUT_RANGE 0 4\nLUT_3D_SIZE 2'));
    expect(range.domainMin).toEqual([0, 0, 0]);
    expect(range.domainMax).toEqual([4, 4, 4]);
  });

  it('accepts size 65 and refuses 66 and 128', () => {
    expect(parseCube(cube(65, identity(65))).size).toBe(65);
    expect(refusal(cube(2, identity(2), 'LUT_3D_SIZE 66'))).toBe(
      'This LUT has 66 points per side. ClipForge supports 3D LUTs with 2 to 65 points per side.',
    );
    expect(refusal('LUT_3D_SIZE 128\n0 0 0')).toBe(
      'This LUT has 128 points per side. ClipForge supports 3D LUTs with 2 to 65 points per side.',
    );
    expect(refusal('LUT_3D_SIZE 1\n0 0 0')).toMatch(/has 1 points per side/);
    expect(refusal('LUT_3D_SIZE 17.5\n0 0 0')).toBe('The LUT_3D_SIZE line of this .cube file is not a whole number.');
  });

  it('refuses a 1D LUT', () => {
    expect(refusal('LUT_1D_SIZE 1024\n0 0 0\n1 1 1')).toBe(
      'This is a 1D LUT. ClipForge only supports 3D LUTs (.cube files with a LUT_3D_SIZE line).',
    );
  });

  it('refuses a file without a size line (including an empty file)', () => {
    const msg = 'This .cube file has no LUT_3D_SIZE line, so it is not a 3D LUT ClipForge can read.';
    expect(refusal('0 0 0\n1 1 1')).toBe(msg);
    expect(refusal('')).toBe(msg);
    expect(refusal('# nothing\r\n')).toBe(msg);
  });

  it('refuses the wrong number of colour rows', () => {
    const rows = cube(2, identity(2)).split('\n');
    expect(refusal(rows.slice(0, -1).join('\n'))).toBe(
      'This .cube file should have 8 colour rows for its size (2) but has 7.',
    );
    expect(refusal([...rows, '1 1 1'].join('\n'))).toBe(
      'This .cube file should have 8 colour rows for its size (2) but has 9.',
    );
  });

  it('refuses non-numeric, non-finite and short or long rows, naming the line', () => {
    const bad = (row: string) => {
      const rows = cube(2, identity(2)).split('\n');
      rows[3] = row;
      return refusal(rows.join('\n'));
    };
    for (const row of ['nan 0 0', 'NaN 0 0', '0 Infinity 0', '0 0 1e999', '0 abc 0', '1 2', '1 2 3 4', '0,0,0']) {
      expect(bad(row), row).toBe(`Line 4 of this .cube file is not three numbers: "${row}".`);
    }
    // A keyword after the colour rows started is not a colour row either.
    expect(bad('NAN 0 0')).toBe('Line 4 of this .cube file is not three numbers: "NAN 0 0".');
  });

  it('refuses a domain whose minimum is not below its maximum', () => {
    expect(refusal(cube(2, identity(2), 'DOMAIN_MIN 0 0 1\nDOMAIN_MAX 1 1 1\nLUT_3D_SIZE 2'))).toBe(
      'DOMAIN_MIN must be below DOMAIN_MAX for every channel in this .cube file.',
    );
    expect(refusal(cube(2, identity(2), 'DOMAIN_MIN 0 0\nLUT_3D_SIZE 2'))).toBe(
      'The DOMAIN_MIN line of this .cube file is not three numbers.',
    );
  });

  it('refuses files over the byte limit before parsing', () => {
    expect(MAX_CUBE_BYTES).toBe(40 * 1024 * 1024);
    expect(() => assertCubeBytes(MAX_CUBE_BYTES)).not.toThrow();
    expect(() => assertCubeBytes(MAX_CUBE_BYTES + 1)).toThrow(CubeError);
    expect(() => assertCubeBytes(MAX_CUBE_BYTES + 1)).toThrow('This .cube file is too large (over 40 MB) to be a LUT ClipForge can use.');
  });
});
