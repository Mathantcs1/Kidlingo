// prepare.mjs <film-dir> [fps] — script.md + voice/dur.json + voice/words.json → timeline.json. Fails if any cut misses a word start.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseScript, validateShots, compileTimeline, wordsFromLines } from './stickset/script.js';
import { alignWords } from './stickset/align.js';
import { checkCueMap } from './stickset/cuemap.js';
import { SET_NAMES } from './stickset/sets/names.js';

const dir = process.argv[2], fps = +(process.argv[3] || 30);
const read = f => readFileSync(join(dir, f), 'utf8');
const shots = parseScript(read('script.md'));
validateShots(shots, SET_NAMES);
const dur = JSON.parse(read('voice/dur.json')), asr = JSON.parse(read('voice/words.json'));
for (const s of shots) if (!(s.id in dur) || !asr[s.id]) throw new Error(`no voice for ${s.id}: run the voice step first`);
const timeline = compileTimeline(shots, shots.map(s => dur[s.id]));
const words = wordsFromLines(timeline, shots.map(s => alignWords(s.text, asr[s.id], m => console.warn(`warning ${s.id}: ${m}`))));
const cuts = timeline.slice(1).map(s => ({ t: s.t0, type: 'cut' }));   // every transition is centred on its shot's first word
const bad = checkCueMap(cuts, words, fps);
if (bad.length) { console.error('cue map violations:\n' + bad.join('\n')); process.exit(1); }
writeFileSync(join(dir, 'timeline.json'), JSON.stringify({ DUR: timeline.at(-1).t1, fps, shots: timeline, words, cuts }, null, 1));
console.log(`timeline.json: ${timeline.length} shots, ${words.length} words, ${timeline.at(-1).t1.toFixed(2)} s, ${cuts.length} cuts all on word starts`);
