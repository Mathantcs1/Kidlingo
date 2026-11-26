import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
// @ts-expect-error plain ES module without type declarations
import { buildPackages, SECRET_PATTERNS } from '../scripts/package-site.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const siteRoot = join(here, '..');
const work = mkdtempSync(join(tmpdir(), 'package-site-test-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));

const names = (zip: string) => execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' }).split('\n').filter((n) => n && !n.endsWith('/'));
const read = (zip: string, name: string) => execFileSync('unzip', ['-p', zip, name], { encoding: 'utf8' });

describe('the real packages', () => {
  const out = join(work, 'real');
  let theme = '';
  let core = '';
  beforeAll(async () => {
    const r = await buildPackages({ out });
    theme = r.themeZip;
    core = r.coreZip;
  });

  it('writes ideatoapps-theme.zip and ideatoapps-core.zip into the out directory', () => {
    expect(theme).toBe(join(out, 'ideatoapps-theme.zip'));
    expect(core).toBe(join(out, 'ideatoapps-core.zip'));
    expect(existsSync(theme) && existsSync(core)).toBe(true);
  });

  it('has exactly one top-level folder each: ideatoapps/ and ideatoapps-core/', () => {
    expect(new Set(names(theme).map((n) => n.split('/')[0]))).toEqual(new Set(['ideatoapps']));
    expect(new Set(names(core).map((n) => n.split('/')[0]))).toEqual(new Set(['ideatoapps-core']));
  });

  it('theme has the style.css header WordPress needs; plugin has its main file header', () => {
    expect(read(theme, 'ideatoapps/style.css')).toMatch(/^\/\*\s*\nTheme Name: IdeaToApps/);
    expect(read(core, 'ideatoapps-core/ideatoapps-core.php')).toMatch(/Plugin Name: IdeaToApps Core/);
    expect(names(theme)).toContain('ideatoapps/functions.php');
    expect(names(core).some((n) => n.startsWith('ideatoapps-core/includes/'))).toBe(true);
  });

  it('contains no .env, dotfiles (except the content deny file), node_modules, tests, docs, .git or screenshots', () => {
    for (const n of [...names(theme), ...names(core)]) {
      const parts = n.split('/');
      if (n === 'ideatoapps-core/content/.htaccess') continue;
      expect(parts.some((p) => p.startsWith('.')), n).toBe(false);
      expect(parts.some((p) => ['node_modules', 'tests', 'test', 'docs', 'screenshots', 'vendor', '.git'].includes(p)), n).toBe(false);
      expect(n.includes('..') || n.startsWith('/'), n).toBe(false);
    }
  });

  it('ships the MCP demo kit as a public static file, and no other .zip', () => {
    const zips = [...names(theme), ...names(core)].filter((n) => /\.zip$/i.test(n));
    expect(zips).toEqual(['ideatoapps/assets/downloads/mcp-demo-kit.zip']);
    const kit = join(work, 'kit-extracted.zip');
    writeFileSync(kit, execFileSync('unzip', ['-p', theme, 'ideatoapps/assets/downloads/mcp-demo-kit.zip'], { maxBuffer: 16 * 1024 * 1024 }));
    const inner = names(kit);
    for (const f of ['mcp-demo-kit/README.md', 'mcp-demo-kit/server.py', 'mcp-demo-kit/setup.sh', 'mcp-demo-kit/truth.py']) expect(inner).toContain(f);
  });

  it('contains no secret-looking strings (sk_live, sk_test, whsec_, ...)', () => {
    for (const zip of [theme, core]) {
      for (const n of names(zip)) {
        const body = execFileSync('unzip', ['-p', zip, n], { encoding: 'latin1', maxBuffer: 64 * 1024 * 1024 });
        for (const re of SECRET_PATTERNS as RegExp[]) expect(re.test(body), `${n} ${re}`).toBe(false);
      }
    }
  });

  it('ships starter content only as guarded PHP files, plus the deny file and index.php stubs', () => {
    const guard = "<?php defined( 'ABSPATH' ) || exit; ?>\n";
    const articles = names(core).filter((n) => n.startsWith('ideatoapps-core/content/articles/'));
    expect(articles.length).toBe(51); // 50 articles + the index.php stub
    for (const n of articles) {
      expect(n, n).toMatch(/\.php$/);
      if (!n.endsWith('/index.php')) expect(read(core, n).startsWith(guard), n).toBe(true);
    }
    expect(names(core).some((n) => /\.(?:html?|json)$/.test(n) && n.startsWith('ideatoapps-core/content/')), 'no .html or .json under content/').toBe(false);
    expect(read(core, 'ideatoapps-core/content/topics.php').startsWith(guard)).toBe(true);
    const deny = read(core, 'ideatoapps-core/content/.htaccess');
    for (const line of ['Options -Indexes', 'Require all denied', 'Deny from all']) expect(deny).toContain(line);
    for (const dir of ['content', 'content/articles', 'content/figures', 'content/heroes']) {
      expect(read(core, `ideatoapps-core/${dir}/index.php`)).toBe('<?php // Silence is golden.\n');
    }
  });

  it('can be run from the command line (npm script entry point)', () => {
    const cliOut = join(work, 'cli');
    execFileSync(process.execPath, [join(siteRoot, 'scripts', 'package-site.mjs'), '--out', cliOut], { encoding: 'utf8' });
    expect(readdirSync(cliOut).sort()).toEqual(['ideatoapps-core.zip', 'ideatoapps-theme.zip']);
  });
});

describe('fixture trees (packaging rules and the secret scan)', () => {
  /** Minimal theme + plugin trees with optional extra files, so rules can be tested without touching the real source. */
  function fixture(name: string, extra: Record<string, string>) {
    const base = join(work, name);
    const theme = join(base, 'theme');
    const plugin = join(base, 'plugin');
    mkdirSync(theme, { recursive: true });
    mkdirSync(plugin, { recursive: true });
    writeFileSync(join(theme, 'style.css'), '/*\nTheme Name: Fixture\n*/\n');
    writeFileSync(join(plugin, 'fixture.php'), '<?php\n/** Plugin Name: Fixture */\n');
    for (const [rel, body] of Object.entries(extra)) {
      const p = join(base, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, body);
    }
    return { themeDir: theme, pluginDir: plugin, out: join(base, 'out') };
  }

  it('leaves out env files, dotfiles, node_modules, tests, docs, screenshots', async () => {
    const f = fixture('rules', {
      'theme/.env': 'X=1',
      'theme/.DS_Store': 'x',
      'theme/node_modules/a/index.js': 'x',
      'theme/tests/a.php': 'x',
      'theme/docs/a.md': 'x',
      'theme/screenshots/a.png': 'x',
      'theme/assets/keep.css': 'a{}',
      'plugin/.git/config': 'x',
      'plugin/includes/keep.php': '<?php',
      'plugin/includes/.htaccess': 'x',
      'theme/content/.htaccess': 'x',
    });
    const r = await buildPackages(f);
    expect(names(r.themeZip).sort()).toEqual(['ideatoapps/assets/keep.css', 'ideatoapps/style.css']);
    expect(names(r.coreZip).sort()).toEqual(['ideatoapps-core/fixture.php', 'ideatoapps-core/includes/keep.php']);
  });

  it('lets exactly the plugin content/.htaccess through (all other dotfiles stay out)', async () => {
    const f = fixture('deny', { 'plugin/content/.htaccess': 'Require all denied', 'plugin/content/.env': 'X=1', 'plugin/content/sub/.htaccess': 'x' });
    const r = await buildPackages(f);
    expect(names(r.coreZip).sort()).toEqual(['ideatoapps-core/content/.htaccess', 'ideatoapps-core/fixture.php']);
  });

  it('ships a .zip only from the theme downloads folder (public free downloads); other zips stay out', async () => {
    const f = fixture('downloads-zip', {
      'theme/assets/downloads/kit.zip': 'PK-fixture',
      'theme/assets/other/stray.zip': 'PK-stray',
      'theme/assets/keep.css': 'a{}',
      'plugin/includes/stray.zip': 'PK-plugin',
    });
    const r = await buildPackages(f);
    expect(names(r.themeZip).sort()).toEqual(['ideatoapps/assets/downloads/kit.zip', 'ideatoapps/assets/keep.css', 'ideatoapps/style.css']);
    expect(names(r.coreZip).sort()).toEqual(['ideatoapps-core/fixture.php']);
  });

  it('still scans a downloads zip for secrets', async () => {
    const f = fixture('downloads-secret', { 'theme/assets/downloads/kit.zip': 'PK sk_live_' + 'a1B2c3D4e5F6g7H8i9J0k1L2' });
    await expect(buildPackages(f)).rejects.toThrow(/secret/i);
  });

  it('does not scan excluded files (a key in docs/ or tests/ does not fail the build)', async () => {
    const f = fixture('excluded-secret', { 'theme/docs/notes.md': 'sk_test_' + 'a'.repeat(24), 'plugin/tests/t.php': 'whsec_' + 'b'.repeat(24) });
    await expect(buildPackages(f)).resolves.toBeTruthy();
  });

  const hits: Array<[string, string]> = [
    ['sk_live', 'sk_live_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
    ['sk_test', 'sk_test_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
    ['restricted rk_live', 'rk_live_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
    ['whsec_', 'whsec_' + 'a1B2c3D4e5F6g7H8i9J0k1L2'],
    ['AWS access key', 'AKIA' + 'ABCDEFGHIJKLMNOP'],
    ['private key block', '-----BEGIN RSA PRIVATE KEY-----'],
    ['GitHub token', 'ghp_' + 'a1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q7R8'],
    ['Slack token', 'xoxb-' + '123456789012-abcdefghijkl'],
    ['Google API key', 'AIza' + 'SyA1B2c3D4e5F6g7H8i9J0k1L2m3N4o5P6q'],
  ];
  it.each(hits)('fails the build when a theme file holds a %s', async (_label, secret) => {
    const f = fixture('secret-theme-' + _label.replace(/\W/g, ''), { 'theme/assets/app.js': `const k = "${secret}";` });
    await expect(buildPackages(f)).rejects.toThrow(/secret/i);
    expect(existsSync(join(f.out, 'ideatoapps-theme.zip'))).toBe(false);
    expect(existsSync(join(f.out, 'ideatoapps-core.zip'))).toBe(false);
  });

  it('fails the build when a plugin file holds a key, and names the file but not the key', async () => {
    const f = fixture('secret-plugin', { 'plugin/includes/pay.php': "<?php $k = 'sk_live_" + "Zy9X8w7V6u5T4s3R2q1P0o9N';" });
    const err = await buildPackages(f).then(() => null, (e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err!.message).toContain('includes/pay.php');
    expect(err!.message).not.toContain('Zy9X8w7V6u5T4s3R2q1P0o9N');
  });

  it('does not flag harmless words that merely mention the key types', async () => {
    const f = fixture('harmless', { 'plugin/includes/note.php': '<?php // keys start with the letters sk and are secret; whsec is a webhook secret.' });
    await expect(buildPackages(f)).resolves.toBeTruthy();
  });
});
