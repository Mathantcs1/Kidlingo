// Builds the downloadable ClipForge zip that is sold to buyers:
//   node scripts/package-clipforge.mjs --version 1.0.0 --out dist-zip
// Zip root: app/ (production build with relative asset paths), the three launchers, README.txt, LICENSE.txt, VERSION.
// The app only runs from http://localhost (not file://), so the launchers start a tiny local web server.
import { ZipArchive } from 'archiver';
import { spawnSync } from 'node:child_process';
import { createWriteStream, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const launchers = join(root, 'scripts', 'launchers');
const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;

// [name inside the zip, source file in scripts/launchers, unix mode, convert to CRLF line endings]
const FILES = [
  ['start-windows.bat', 'start-windows.bat', 0o644, true],
  ['start-mac.command', 'start-mac.command', 0o755, false],
  ['start-linux.sh', 'start-linux.sh', 0o755, false],
  ['README.txt', 'README-buyer.txt', 0o644, false],
  ['LICENSE.txt', 'LICENSE-buyer.txt', 0o644, false],
];

function run(args) {
  const r = spawnSync(process.execPath, args, { cwd: root, stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) throw new Error(`${args.slice(0, 2).join(' ')} failed (exit ${r.status})`);
}

function* walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/** Builds the app and writes `<out>/ClipForge-<version>.zip`; resolves to the zip's path. */
export async function buildZip({ version, out }) {
  if (typeof version !== 'string' || !SEMVER.test(version)) {
    throw new Error(`version must be semver like 1.0.0, got "${version}"`);
  }
  const tmp = mkdtempSync(join(tmpdir(), 'clipforge-build-'));
  try {
    const appDir = join(tmp, 'app');
    run([join(root, 'scripts', 'copy-licenses.mjs')]); // THIRD-PARTY notices go into the build via public/licenses
    run([join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--base=./', '--outDir', appDir, '--emptyOutDir']);

    mkdirSync(resolve(out), { recursive: true });
    const zipPath = join(resolve(out), `ClipForge-${version}.zip`);
    const archive = new ZipArchive({ zlib: { level: 9 } });
    const done = new Promise((ok, fail) => {
      const stream = createWriteStream(zipPath);
      stream.on('close', ok);
      stream.on('error', fail);
      archive.on('error', fail);
      archive.pipe(stream);
    });
    const stamp = new Date('2026-01-01T00:00:00Z'); // fixed, so identical input gives an identical zip
    for (const [name, source, mode, crlf] of FILES) {
      let text = readFileSync(join(launchers, source), 'utf8').replace(/\r\n/g, '\n');
      if (crlf) text = text.replace(/\n/g, '\r\n');
      archive.append(text, { name, mode, date: stamp });
    }
    archive.append(`${version}\n`, { name: 'VERSION', mode: 0o644, date: stamp });
    for (const file of [...walk(appDir)].sort()) {
      archive.file(file, { name: `app/${relative(appDir, file).split(sep).join('/')}`, mode: 0o644, date: stamp });
    }
    await archive.finalize();
    await done;
    return zipPath;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const version = arg('version');
  if (!version) {
    console.error('usage: node scripts/package-clipforge.mjs --version <semver> --out <dir>');
    process.exit(2);
  }
  buildZip({ version, out: arg('out') ?? 'dist-zip' }).then(
    (zip) => console.log(`wrote ${zip}`),
    (err) => {
      console.error(err.message);
      process.exit(1);
    },
  );
}
