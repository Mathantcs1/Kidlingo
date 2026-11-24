// Render a per-episode CHARACTER SHEET / LOCATION SHEET / MATERIALS SHEET to a PNG.
// usage: node sheet.mjs <sheet.json> <out.png>
// sheet.json: { "title":"...", "sections":[ { "name":"CHARACTERS", "items":[ {"id":"itdev","opts":{...},"scale":0.9,"label":"Dev: hoodie, two dots, one line"} ] } ] }
import { createRequire } from 'module';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
const req = createRequire(import.meta.url);
let pw; try { pw = req('playwright'); } catch { pw = createRequire(execSync('npm root -g').toString().trim() + '/x.js')('playwright'); }
const SK = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const [, , jf, outPng] = process.argv;
const sheet = JSON.parse(fs.readFileSync(jf, 'utf8'));
const browser = await pw.chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
await page.setContent(`<html><head><style>@font-face{font-family:P;src:url(file://${SK}/engine/fonts/Poppins-800.ttf)}body{margin:0;background:${sheet.bg || '#f4efe6'};font-family:P,sans-serif;color:#14263d;padding:40px;width:1520px}
h1{font-size:44px;margin:0 0 20px}h2{font-size:28px;letter-spacing:3px;margin:34px 0 14px;border-bottom:4px solid #14263d;padding-bottom:6px}.row{display:flex;flex-wrap:wrap;gap:26px;align-items:flex-end}.it{background:#fff;border:4px solid #14263d;border-radius:18px;padding:14px;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:17px;text-align:center;max-width:none;box-sizing:content-box}.w{overflow:hidden;position:relative}.it svg{display:block}</style></head><body><h1>${sheet.title}</h1><div id=r></div></body></html>`);
await page.addScriptTag({ path: path.join(SK, 'engine', 'props.js') });
for (const f of fs.readdirSync(path.join(SK, 'engine')).filter(f => /^props\d+\.js$/.test(f)).sort()) await page.addScriptTag({ path: path.join(SK, 'engine', f) });
await page.evaluate(s => {
  const r = document.getElementById('r');
  for (const sec of s.sections) {
    const h = document.createElement('h2'); h.textContent = sec.name; r.appendChild(h);
    const row = document.createElement('div'); row.className = 'row'; r.appendChild(row);
    for (const it of sec.items) {
      const p = window.PROPS[it.id](it.opts || {}), d = document.createElement('div'); d.className = 'it';
      const sc = it.scale || 1; d.innerHTML = `<div class="w" style="width:${p.w * sc}px;height:${p.h * sc}px"><div style="position:absolute;left:0;top:0;width:${p.w}px;height:${p.h}px;transform:scale(${sc});transform-origin:0 0">${p.svg}</div></div><div style="width:${Math.max(p.w * sc, 200)}px">${it.label || ''}</div>`;
      row.appendChild(d);
    }
  }
}, sheet);
await page.setViewportSize({ width: 1600, height: Math.ceil(await page.evaluate(() => document.body.scrollHeight)) + 20 });
await page.screenshot({ path: outPng, fullPage: true });
await browser.close();
