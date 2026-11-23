// srt-cues.mjs <timeline.json> <cues.json> — one subtitle per shot (burned-in captions are word-by-word; the .srt carries full lines)
import { readFileSync, writeFileSync } from 'node:fs';
const [tl, out] = process.argv.slice(2);
const { shots } = JSON.parse(readFileSync(tl, 'utf8'));
writeFileSync(out, JSON.stringify(shots.map(s => ({ t0: s.t0, t1: s.t1, text: s.text }))));
