import { describe, it, expect } from 'vitest';
import { parseCube } from '../src/fx/cube';

/** An identity cube of edge `n`, red fastest. */
function identity(n: number, header = ''): string {
  const rows: string[] = [];
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) rows.push(`${r / (n - 1)} ${g / (n - 1)} ${b / (n - 1)}`);
  return `${header}LUT_3D_SIZE ${n}\n${rows.join('\n')}\n`;
}
const fail = (text: string): string => {
  const r = parseCube(text);
  if (r.ok) throw new Error('expected a failure');
  return r.reason;
};

describe('parseCube', () => {
  it('parses an identity 2x2x2 cube, red fastest', () => {
    const r = parseCube(identity(2));
    if (!r.ok) throw new Error(r.reason);
    expect(r.size).toBe(2);
    expect(r.data).toHaveLength(24);
    expect(Array.from(r.data.slice(0, 6))).toEqual([0, 0, 0, 1, 0, 0]);
    expect(Array.from(r.data.slice(6, 9))).toEqual([0, 1, 0]);
    expect(r.domainMin).toEqual([0, 0, 0]);
    expect(r.domainMax).toEqual([1, 1, 1]);
  });

  it('accepts comments, TITLE, blank lines and CRLF', () => {
    const text = identity(2, '# made by hand\r\nTITLE "Warm look"\r\n\r\n').replace(/\n/g, '\r\n');
    const r = parseCube(text);
    expect(r.ok && r.title).toBe('Warm look');
    expect(r.ok && r.size).toBe(2);
  });

  it('honours DOMAIN_MIN and DOMAIN_MAX', () => {
    const r = parseCube(identity(2, 'DOMAIN_MIN 0 0 0\nDOMAIN_MAX 2 2 2\n'));
    expect(r.ok && r.domainMax).toEqual([2, 2, 2]);
    expect(fail(identity(2, 'DOMAIN_MIN 1 1 1\nDOMAIN_MAX 1 1 1\n'))).toMatch(/domain/i);
  });

  it('refuses 1D LUTs, wrong row counts, NaN, oversized and header-less files, each with its own reason', () => {
    const reasons = [
      fail('LUT_1D_SIZE 4\n0 0 0\n0.3 0.3 0.3\n0.6 0.6 0.6\n1 1 1\n'),
      fail(identity(2).split('\n').slice(0, -3).join('\n')),
      fail(identity(2).replace('0 1 0', 'NaN 1 0')),
      fail('LUT_3D_SIZE 70\n0 0 0\n'),
      fail('0 0 0\n1 1 1\n'),
      fail(`0 0 0\n${identity(2)}`),
      fail('LUT_3D_SIZE 1\n0 0 0\n'),
      fail(''),
    ];
    expect(reasons[0]).toMatch(/1D/);
    expect(reasons[1]).toMatch(/rows/);
    expect(reasons[2]).toMatch(/number/i);
    expect(reasons[3]).toMatch(/between 2 and 65/);
    expect(reasons[4]).toMatch(/LUT_3D_SIZE/);
    expect(reasons[5]).toMatch(/LUT_3D_SIZE/);
    expect(reasons[6]).toMatch(/between 2 and 65/);
    expect(new Set(reasons).size).toBeGreaterThanOrEqual(6);
  });

  it('parses a 33x33x33 cube in well under 200 ms', () => {
    const text = identity(33);
    const t0 = performance.now();
    const r = parseCube(text);
    expect(performance.now() - t0).toBeLessThan(200);
    expect(r.ok && r.data.length).toBe(33 ** 3 * 3);
  });
});
