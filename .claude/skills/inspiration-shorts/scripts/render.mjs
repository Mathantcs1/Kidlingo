// usage: node render.mjs <project> stills 1.5,4,9   |  events  |  frames [fps] [png|jpg]   (png = lossless master frames)
import fs from 'fs';
import path from 'path';
import { openProject } from './common.mjs';
import { spawn } from 'child_process';
import os from 'os';
const [, , proj, mode, arg] = process.argv;
const out = path.join(proj, 'out'); fs.mkdirSync(out, { recursive: true });
// frames are rendered by several Chromium workers in parallel (SHARDS env, default = CPU count, max 6); each handles frames i % S == k
if (mode === 'frames' && !process.env.SHARD) {
  const S = Math.max(1, Math.min(+(process.env.SHARDS || os.cpus().length), 6)), dir0 = path.join(out, 'fr');
  fs.rmSync(dir0, { recursive: true, force: true }); fs.mkdirSync(dir0);
  const codes = await Promise.all([...Array(S).keys()].map(k => new Promise(res => spawn(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, SHARD: `${k}/${S}` } }).on('exit', res))));
  if (codes.some(c => c)) { console.error('frame worker failed'); process.exit(1); }
  console.log('frames done (' + S + ' workers)'); process.exit(0);
}
const { browser, page } = await openProject(proj);
const dur = await page.evaluate(() => window.DURATION);
if (mode === 'stills') {
  for (const t of arg.split(',').map(Number)) { await page.evaluate(t => window.renderAt(t), t); await page.screenshot({ path: path.join(out, `still_${t}.png`) }); }
} else if (mode === 'events') {
  fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify({ duration: dur, events: await page.evaluate(() => window.EV) }));
  console.log('duration', dur.toFixed(2));
} else if (mode === 'frames') {
  const fps = +(arg || 30), ext = process.argv[5] === 'jpg' ? 'jpg' : 'png', N = Math.ceil(dur * fps), dir = path.join(out, 'fr'), [sk, sn] = (process.env.SHARD || '0/1').split('/').map(Number);
  fs.mkdirSync(dir, { recursive: true });
  for (let i = sk; i < N; i += sn) { await page.evaluate(t => window.renderAt(t), i / fps); await page.screenshot(ext === 'jpg' ? { path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 93 } : { path: path.join(dir, String(i).padStart(5, '0') + '.png') }); }
  console.log('frames', N);
}
await browser.close();
