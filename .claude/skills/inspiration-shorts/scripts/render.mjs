// usage: node render.mjs <project> stills 1.5,4,9   |  events  |  frames [fps] [png|jpg]   (png = lossless master frames)
import fs from 'fs';
import path from 'path';
import { openProject } from './common.mjs';
const [, , proj, mode, arg] = process.argv;
const out = path.join(proj, 'out'); fs.mkdirSync(out, { recursive: true });
const { browser, page } = await openProject(proj);
const dur = await page.evaluate(() => window.DURATION);
if (mode === 'stills') {
  for (const t of arg.split(',').map(Number)) { await page.evaluate(t => window.renderAt(t), t); await page.screenshot({ path: path.join(out, `still_${t}.png`) }); }
} else if (mode === 'events') {
  fs.writeFileSync(path.join(out, 'events.json'), JSON.stringify({ duration: dur, events: await page.evaluate(() => window.EV) }));
  console.log('duration', dur.toFixed(2));
} else if (mode === 'frames') {
  const fps = +(arg || 30), ext = process.argv[5] === 'jpg' ? 'jpg' : 'png', N = Math.ceil(dur * fps), dir = path.join(out, 'fr'); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir);
  for (let i = 0; i < N; i++) { await page.evaluate(t => window.renderAt(t), i / fps); await page.screenshot(ext === 'jpg' ? { path: path.join(dir, String(i).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 93 } : { path: path.join(dir, String(i).padStart(5, '0') + '.png') }); }
  console.log('frames', N);
}
await browser.close();
