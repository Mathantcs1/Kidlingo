// Collects the licence texts of everything that ships in the built site into public/licenses/ (copied to
// dist/licenses/ by Vite): the runtime dependencies (transitively, without type-only @types packages), the FFmpeg
// build inside @mediabunny/aac-encoder, and the small runtime helpers Vite/Rolldown add to the bundle.
// public/licenses/THIRD-PARTY.txt summarises them and includes each full text. Runs before `dev` and `build`.
import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'public', 'licenses');
const pkgDir = (name) => join(root, 'node_modules', name);
const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const LICENSE_FILE = /^(licen[cs]e|copying|notice)(\.(md|txt))?$/i;

/** Runtime dependency names reachable from package.json "dependencies", skipping type-only packages. */
function runtimePackages() {
  const seen = new Set();
  const queue = Object.keys(readJson(join(root, 'package.json')).dependencies ?? {});
  while (queue.length > 0) {
    const name = queue.shift();
    if (seen.has(name) || name.startsWith('@types/')) continue;
    seen.add(name);
    queue.push(...Object.keys(readJson(join(pkgDir(name), 'package.json')).dependencies ?? {}));
  }
  return [...seen].sort();
}

function repoUrl(pkg) {
  const url = typeof pkg.repository === 'string' ? pkg.repository : pkg.repository?.url;
  return url ? url.replace(/^git\+/, '').replace(/\.git$/, '') : (pkg.homepage ?? 'n/a');
}

function licenseFiles(dir) {
  return readdirSync(dir).filter((f) => LICENSE_FILE.test(f)).sort();
}

const rule = (title) => `\n${'='.repeat(78)}\n${title}\n${'='.repeat(78)}\n\n`;
const sections = [];
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const name of runtimePackages()) {
  const dir = pkgDir(name);
  const pkg = readJson(join(dir, 'package.json'));
  const files = licenseFiles(dir);
  if (files.length === 0) throw new Error(`No licence file found for ${name}`);
  const target = join(out, name);
  mkdirSync(target, { recursive: true });
  let text = `${name} ${pkg.version}\nLicense: ${pkg.license}\nSource: ${repoUrl(pkg)}\n`;
  for (const f of files) {
    copyFileSync(join(dir, f), join(target, f));
    text += `\n--- ${f} ---\n\n${readFileSync(join(dir, f), 'utf8').trim()}\n`;
  }
  // @mediabunny/aac-encoder embeds a WASM build of FFmpeg (LGPL-2.1-or-later); its README states the exact build.
  const ffmpeg = join(dir, 'licenses', 'ffmpeg');
  if (existsSync(ffmpeg)) {
    const readme = readFileSync(join(dir, 'README.md'), 'utf8');
    const provenance = /## Provenance\n([\s\S]*?)(\n## |$)/.exec(readme)?.[1].trim();
    if (!provenance) throw new Error(`${name}: README has no Provenance section`);
    mkdirSync(join(target, 'licenses', 'ffmpeg'), { recursive: true });
    text += `\n--- Embedded FFmpeg (WASM AAC encoder): provenance, quoted from the ${name} README ---\n\n${provenance}\n`;
    text += `\nFFmpeg source code: https://github.com/FFmpeg/FFmpeg (the commit named above) and https://ffmpeg.org/download.html\n`;
    for (const f of readdirSync(ffmpeg).sort()) {
      copyFileSync(join(ffmpeg, f), join(target, 'licenses', 'ffmpeg', f));
      text += `\n--- FFmpeg ${f} ---\n\n${readFileSync(join(ffmpeg, f), 'utf8').trim()}\n`;
    }
  }
  sections.push({ title: `${name} ${pkg.version} (${pkg.license})`, text });
}

// Bundler runtime helpers (module preload polyfill, CommonJS interop) included in the built JavaScript.
const vite = readJson(join(pkgDir('vite'), 'package.json'));
const viteCore = readFileSync(join(pkgDir('vite'), 'LICENSE.md'), 'utf8').split('# Licenses of bundled dependencies')[0].trim();
sections.push({
  title: `vite ${vite.version} (${vite.license}) - runtime helpers in the bundle`,
  text: `vite ${vite.version}\nLicense: ${vite.license}\nSource: ${repoUrl(vite)}\n\n${viteCore}\n`,
});
const rolldown = readJson(join(pkgDir('rolldown'), 'package.json'));
sections.push({
  title: `rolldown ${rolldown.version} (${rolldown.license}) - runtime helpers in the bundle`,
  text: `rolldown ${rolldown.version}\nLicense: ${rolldown.license}\nSource: ${repoUrl(rolldown)}\n\n${readFileSync(join(pkgDir('rolldown'), 'LICENSE'), 'utf8').trim()}\n`,
});

const summary = [
  'ClipForge third-party software notices',
  '',
  'ClipForge includes the following third-party software. Each section below names the package, its version and',
  'licence, where its source code is available, and the full licence text. The original licence files are also',
  'in the folders next to this file.',
  '',
  ...sections.map((s) => `- ${s.title}`),
];
writeFileSync(join(out, 'THIRD-PARTY.txt'), `${summary.join('\n')}\n${sections.map((s) => rule(s.title) + s.text).join('')}`);
console.log(`licenses: wrote ${sections.length} notices to public/licenses/THIRD-PARTY.txt`);
