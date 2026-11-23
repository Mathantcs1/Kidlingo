// estimate-cli.mjs <film-dir> <fps> <WxH> — prints the render estimate from timeline.json; warns past the 2 hour budget. Exits 3 past the 2 hour budget (build.sh stops unless CONFIRM_LONG_RENDER=1).
import { readFileSync } from 'node:fs';
import { estimateRenderSeconds, exceedsBudget } from './estimate.js';
const [dir, fps, size, style = 'classic'] = process.argv.slice(2), [w, h] = size.split('x').map(Number);
const { DUR } = JSON.parse(readFileSync(`${dir}/timeline.json`, 'utf8'));
const s = estimateRenderSeconds({ dur: DUR, fps: +fps, w, h, style });
console.log(`estimated render for ${size}: about ${(s / 60).toFixed(1)} min (${DUR.toFixed(1)} s film, estimate only)`);
if (exceedsBudget(s)) { console.log('WARNING: estimated render exceeds 2 hours. Tell the user and offer a shorter film or a draft/lower-resolution cut.'); process.exit(3); }
