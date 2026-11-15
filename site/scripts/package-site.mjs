// Builds the two zips that are uploaded to WordPress (Appearance > Themes > Add New, Plugins > Add New):
//   node site/scripts/package-site.mjs [--out dist-site]
//   -> ideatoapps-theme.zip (top folder ideatoapps/) and ideatoapps-core.zip (top folder ideatoapps-core/)
// Development files never ship: dotfiles (.env, .git, .DS_Store), node_modules, vendor, tests, docs, screenshots, logs.
// Every file that WOULD ship is scanned for key-like strings first; any hit fails the build and no zip is written.
import { ZipArchive } from 'archiver';
import { createWriteStream, lstatSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const siteRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = join(siteRoot, '..');

/** [label, pattern]. Patterns have no g flag, so `.test()` is stateless. Labels (never the match) go into error messages. */
const SECRET_RULES = [
  ['Stripe key (sk_/rk_/pk_ live or test)', /\b(?:sk|rk|pk)_(?:live|test)_/],
  ['Stripe webhook secret (whsec_)', /whsec_/],
  ['AWS access key id', /AKIA[0-9A-Z]{16}/],
  ['private key block', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub token', /gh[pousr]_[A-Za-z0-9]{30,}/],
  ['Slack token', /xox[abprs]-[A-Za-z0-9-]{10,}/],
  ['Google API key', /AIza[0-9A-Za-z_-]{30,}/],
];
export const SECRET_PATTERNS = SECRET_RULES.map(([, re]) => re);

const SKIP_DIRS = new Set(['node_modules', 'vendor', 'tests', 'test', 'docs', 'screenshots']);
const SKIP_EXT = /\.(?:log|bak|orig|swp|map|zip)$|~$/i;

/** Every file under `dir` that belongs in a package, as relative posix paths, sorted. Symlinks are refused. */
function collect(dir) {
  const found = [];
  const visit = (abs) => {
    for (const e of readdirSync(abs, { withFileTypes: true })) {
      const p = join(abs, e.name);
      if (e.name.startsWith('.')) continue; // .env, .git, .DS_Store, .htaccess of the dev tree, ...
      if (e.isSymbolicLink() || lstatSync(p).isSymbolicLink()) throw new Error(`symbolic link not allowed in a package: ${relative(dir, p)}`);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name.toLowerCase())) visit(p);
      } else if (e.isFile() && !SKIP_EXT.test(e.name)) {
        found.push(relative(dir, p).split(sep).join('/'));
      }
    }
  };
  visit(dir);
  return found.sort();
}

function scan(dir, files) {
  const problems = [];
  for (const f of files) {
    const body = readFileSync(join(dir, f)).toString('latin1');
    for (const [label, re] of SECRET_RULES) if (re.test(body)) problems.push(`${f}: ${label}`);
  }
  return problems;
}

async function writeZip(zipPath, dir, files, top) {
  const tmpPath = `${zipPath}.partial`;
  const archive = new ZipArchive({ zlib: { level: 9 } });
  const done = new Promise((ok, fail) => {
    const stream = createWriteStream(tmpPath);
    stream.on('close', ok);
    stream.on('error', fail);
    archive.on('error', fail);
    archive.pipe(stream);
  });
  const stamp = new Date('2026-01-01T00:00:00Z'); // fixed, so identical input gives an identical zip
  for (const f of files) archive.file(join(dir, f), { name: `${top}/${f}`, mode: 0o644, date: stamp });
  await archive.finalize();
  await done;
  renameSync(tmpPath, zipPath);
}

/**
 * Builds both zips into `out`. Resolves to { themeZip, coreZip }. Rejects (and writes nothing) when a file that would
 * ship contains a key-like string or when a required header file is missing.
 */
export async function buildPackages({
  out = join(repoRoot, 'dist-site'),
  themeDir = join(siteRoot, 'wp-content', 'themes', 'ideatoapps'),
  pluginDir = join(siteRoot, 'wp-content', 'plugins', 'ideatoapps-core'),
} = {}) {
  const dest = resolve(out);
  for (const z of ['ideatoapps-theme.zip', 'ideatoapps-core.zip']) rmSync(join(dest, z), { force: true }); // a failed run never leaves an older zip behind
  const parts = [
    ['ideatoapps-theme.zip', themeDir, 'ideatoapps'],
    ['ideatoapps-core.zip', pluginDir, 'ideatoapps-core'],
  ].map(([zip, dir, top]) => ({ zip, dir, top, files: collect(dir) }));

  if (!parts[0].files.includes('style.css')) throw new Error('theme has no style.css (WordPress needs its header)');
  if (!parts[1].files.some((f) => !f.includes('/') && f.endsWith('.php'))) throw new Error('plugin has no main .php file');

  const problems = parts.flatMap((p) => scan(p.dir, p.files).map((m) => `${p.top}/${m}`));
  if (problems.length) {
    throw new Error(`possible secret found, nothing was packaged:\n  ${problems.join('\n  ')}\nRemove it (keys belong in the WordPress admin or wp-config.php, never in the theme or plugin).`);
  }

  mkdirSync(dest, { recursive: true });
  const [theme, core] = parts;
  for (const p of parts) await writeZip(join(dest, p.zip), p.dir, p.files, p.top);
  return { themeZip: join(dest, theme.zip), coreZip: join(dest, core.zip) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const i = process.argv.indexOf('--out');
  buildPackages(i > 0 ? { out: process.argv[i + 1] } : {}).then(
    ({ themeZip, coreZip }) => console.log(`wrote ${themeZip}\nwrote ${coreZip}`),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
