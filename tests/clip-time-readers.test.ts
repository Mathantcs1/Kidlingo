// Plan 5D Task 1: source scan. Clip time is mapped in ONE place (src/core/clipTime.ts); an open-coded
// duration (`out - in`), footage offset (`in + (t - start)`) or timeline-from-footage time (`start + (u - in)`) anywhere
// else fails here, so speed, reverse and ramps cannot be forgotten at a site. Each allowlist entry must match exactly one
// line (a stale entry fails too) and says why that line is not a clip time.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '..');

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(n) ? [p] : [];
  });
}

const PATTERNS: [string, RegExp][] = [
  ['duration', /\b[A-Za-z_]\w*\.out\s*-\s*[A-Za-z_]\w*\.in\b/],
  ['footage offset', /\b[A-Za-z_]\w*\.in\s*\+\s*[(A-Za-z_]/],
  ['timeline from footage', /\.start\s*\+\s*\([^)]*-\s*[A-Za-z_]\w*\.in\b/],
];

/** [file, a substring of the line, why]. */
type Allowed = [string, string, string];
const ALLOWED: Allowed[] = [
  ['src/core/migrate.ts', 'c.out >= c.in ? c.out - c.in : null', 'raw saved JSON (not a Clip yet): the stored footage length used to fit audio fades; Task 3 (data v9) makes it speed-aware'],
];

interface Hit { file: string; line: number; text: string; kind: string }

function scan(sources?: { file: string; text: string }[]): Hit[] {
  const all = sources ?? files(join(ROOT, 'src')).map((f) => ({ file: relative(ROOT, f), text: readFileSync(f, 'utf8') }));
  const hits: Hit[] = [];
  for (const { file, text } of all) {
    if (file === 'src/core/clipTime.ts') continue;
    text.split('\n').forEach((raw, i) => {
      const code = raw.replace(/\/\/.*$/, '');
      if (/^\s*(\*|\/\*)/.test(code)) return; // comments
      for (const [kind, re] of PATTERNS) if (re.test(code)) hits.push({ file, line: i + 1, text: raw.trim(), kind });
    });
  }
  return hits;
}

function audit(hits: Hit[]): { unlisted: Hit[]; stale: string[] } {
  const used = new Map<number, number>();
  const unlisted = hits.filter((h) => {
    const k = ALLOWED.findIndex(([f, sub]) => f === h.file && h.text.includes(sub));
    if (k < 0) return true;
    used.set(k, (used.get(k) ?? 0) + 1);
    return false;
  });
  const stale = ALLOWED.flatMap(([f, sub], k) => ((used.get(k) ?? 0) === 1 ? [] : [`${f}: ${sub} (expected 1, found ${used.get(k) ?? 0})`]));
  return { unlisted, stale };
}

describe('clip time is mapped only in src/core/clipTime.ts', () => {
  it('no open-coded duration, footage offset or timeline-from-footage time elsewhere in src', () => {
    const { unlisted, stale } = audit(scan());
    expect(unlisted.map((h) => `${h.file}:${h.line} [${h.kind}] ${h.text}`), 'open-coded clip time').toEqual([]);
    expect(stale, 'stale allowlist entries').toEqual([]);
  });

  it('the detector catches the three shapes (so the scan can fail)', () => {
    const fake = (text: string) => scan([{ file: 'src/ui/new.ts', text }]);
    expect(fake('const d = clip.out - clip.in;')).toHaveLength(1);
    expect(fake('const u = clip.in + (t - clip.start);')).toHaveLength(1);
    expect(fake('const u = c.in + delta;')).toHaveLength(1);
    expect(fake('const t = c.start + (u - c.in);')).toHaveLength(1);
    expect(fake('// clip.out - clip.in in a comment')).toHaveLength(0);
    expect(fake('const ok = clipDuration(clip);')).toHaveLength(0);
    expect(scan([{ file: 'src/core/clipTime.ts', text: 'return c.out - c.in;' }])).toHaveLength(0);
  });
});
