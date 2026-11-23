// prepare.mjs <film-dir> [fps] — script.md + voice/dur.json + voice/words.json → timeline.json (sketch style). Fails if any transition misses a word start.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseScript, validateShots, compileTimeline, expandBeats } from './stickset/script.js';
import { alignWords } from './stickset/align.js';
import { checkCueMap } from './stickset/cuemap.js';
import { checkVariety } from './stickset/variety.js';
import { SHOT_SIZE } from './stickset/sketchcams.js';
import { SKETCH_SET_NAMES } from './stickset/sketchsets.js';
import { SKETCH_VOCAB } from './stickset/vocab.js';

const dir = process.argv[2], fps = +(process.argv[3] || 30);
const read = f => readFileSync(join(dir, f), 'utf8');
const blocks = parseScript(read('script.md'), { style: 'sketch' });
validateShots(blocks, SKETCH_SET_NAMES, SKETCH_VOCAB);
const dur = JSON.parse(read('voice/dur.json')), asr = JSON.parse(read('voice/words.json'));
for (const s of blocks) if (!(s.id in dur) || !asr[s.id]) throw new Error(`no voice for ${s.id}: run the voice step first`);
const blockTimes = compileTimeline(blocks, blocks.map(s => dur[s.id])), r6 = x => Math.round(x * 1e6) / 1e6;
const blockWords = blocks.map((s, i) => alignWords(s.text, asr[s.id], m => console.warn(`warning ${s.id}: ${m}`)).map(w => ({ text: w.text, start: r6(blockTimes[i].voiceT0 + w.start), end: r6(blockTimes[i].voiceT0 + w.end) })));
const timeline = expandBeats(blockTimes, blockWords, { style: 'sketch' });   // inline {beats} cut a voice line into fast shots, each starting ON its word
validateShots(timeline, SKETCH_SET_NAMES, SKETCH_VOCAB);
const words = blockWords.flat();
const varietyProblems = checkVariety(timeline, { sizeOf: c => SHOT_SIZE[c] });   // the pictures must follow the narration: enough scenes, a new camera every cut
if (varietyProblems.length && process.env.VARIETY !== 'off') { console.error('storyboard problems (set VARIETY=off to override):\n' + varietyProblems.map(p => '  - ' + p).join('\n')); process.exit(1); }
const cuts = timeline.slice(1).map(s => ({ t: s.t0, type: 'cut' }));   // every shot change is centred on its first spoken word
const bad = checkCueMap(cuts, words, fps);
if (bad.length) { console.error('cue map violations:\n' + bad.join('\n')); process.exit(1); }
writeFileSync(join(dir, 'timeline.json'), JSON.stringify({ DUR: timeline.at(-1).t1, fps, shots: timeline, words, cuts, voice: blockTimes.map(b => ({ id: b.id, t0: b.voiceT0 })) }, null, 1));   // voice = one narration file per script block
console.log(`timeline.json: ${timeline.length} shots (${(timeline.at(-1).t1 / timeline.length).toFixed(2)} s each), ${words.length} words, ${timeline.at(-1).t1.toFixed(2)} s, ${cuts.length} shot changes all on word starts`);
