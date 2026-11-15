import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildZip } from '../scripts/package-clipforge.mjs';

// Packages the real production build, so one build is shared by all assertions (it takes a while).
const work = mkdtempSync(join(tmpdir(), 'clipforge-zip-test-'));
let zipPath = '';

const names = () => execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).split('\n').filter((n) => n && !n.endsWith('/'));
const read = (name: string) => execFileSync('unzip', ['-p', zipPath, name], { encoding: 'utf8' });
/** Unix permission string of an entry as printed by `unzip -Z`, e.g. "-rwxr-xr-x". */
const perms = (name: string) => {
  const line = execFileSync('unzip', ['-Z', zipPath], { encoding: 'utf8' })
    .split('\n')
    .find((l) => l.endsWith(` ${name}`));
  return line?.split(/\s+/)[0];
};

beforeAll(async () => {
  zipPath = await buildZip({ version: '1.0.0', out: work });
}, 300_000);

afterAll(() => rmSync(work, { recursive: true, force: true }));

describe('buildZip', () => {
  it('writes ClipForge-<version>.zip into the out directory', () => {
    expect(zipPath).toBe(join(work, 'ClipForge-1.0.0.zip'));
  });

  it('has exactly the documented root: app/, three launchers, README.txt, LICENSE.txt, VERSION', () => {
    const all = names();
    const top = new Set(all.map((n) => n.split('/')[0]));
    expect([...top].sort()).toEqual(['LICENSE.txt', 'README.txt', 'VERSION', 'app', 'start-linux.sh', 'start-mac.command', 'start-windows.bat']);
    expect(all).toContain('app/index.html');
    expect(all.filter((n) => n.startsWith('app/assets/')).length).toBeGreaterThan(0);
  });

  it('VERSION contains the version', () => {
    expect(read('VERSION').trim()).toBe('1.0.0');
  });

  it('builds the app with relative asset paths so it works from any folder', () => {
    const html = read('app/index.html');
    expect(html).toContain('./assets/');
    expect(html).not.toMatch(/(src|href)="\/assets/);
  });

  it('keeps the executable bit on the mac and linux launchers', () => {
    expect(perms('start-mac.command')).toBe('-rwxr-xr-x');
    expect(perms('start-linux.sh')).toBe('-rwxr-xr-x');
    expect(perms('README.txt')).toBe('-rw-r--r--');
  });

  it('ships launchers that follow the agreed fallback order and the install message', () => {
    for (const file of ['start-linux.sh', 'start-mac.command', 'start-windows.bat']) {
      const text = read(file);
      expect(text).toContain('http.server');
      expect(text).toContain('npx --yes serve');
      expect(text).toContain('CLIPFORGE_NO_OPEN');
      expect(text).toContain('Install Python 3 (python.org) or Node.js (nodejs.org), then run this again');
    }
    expect(read('start-windows.bat')).toContain('\r\n');
  });

  it('is honest: Safari untested, draft licence, IdeaToApps', () => {
    expect(read('README.txt')).toMatch(/Safari untested/);
    expect(read('LICENSE.txt')).toMatch(/DRAFT, pending legal review/);
    expect(read('LICENSE.txt')).toContain('IdeaToApps');
  });

  it('rejects a version that is not semver, before building anything', async () => {
    for (const bad of ['1.0', 'v1.0.0', 'latest', '', '1.0.0/../x']) {
      await expect(buildZip({ version: bad, out: work })).rejects.toThrow(/semver/i);
    }
  });

  it('shipped launcher sources are plain text we can read back', () => {
    expect(readFileSync(join(__dirname, '..', 'scripts', 'launchers', 'start-linux.sh'), 'utf8')).toMatch(/^#!\/bin\/sh/);
  });
});
