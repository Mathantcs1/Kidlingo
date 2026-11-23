// shared: open the engine page with a project's spec + words
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Playwright resolves from the project, NODE_PATH, or the global npm root (ESM ignores NODE_PATH, so use require).
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch { pw = createRequire(execSync('npm root -g').toString().trim() + '/x.js')('playwright'); }
const { chromium } = pw;
export const SKILL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export async function openProject(proj) {
  const spec = JSON.parse(fs.readFileSync(path.join(proj, 'spec.json'), 'utf8'));
  const words = JSON.parse(fs.readFileSync(path.join(proj, 'words.json'), 'utf8'));
  if (spec.kitFile) spec.kit = Object.assign({}, JSON.parse(fs.readFileSync(path.resolve(proj, spec.kitFile), 'utf8')), spec.kit || {});
  const browser = await chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  page.on('pageerror', e => { console.error('PAGE ERROR:', e.message); process.exitCode = 2; });
  await page.goto('file://' + path.join(SKILL, 'engine', 'index.html'));
  const err = await page.evaluate(async ([s, w]) => { try { await window.init(s, w); return null; } catch (e) { return String(e.message || e); } }, [spec, words]);
  if (err) { console.error('SPEC ERROR:', err); await browser.close(); process.exit(2); }
  return { browser, page, spec, words };
}
