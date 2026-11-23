// place-beats.mjs <film-dir> <storyboard.json>
// storyboard.json = [ [shot, shot, ...], ... ] one array per narration line (script block); a shot = {set,cam,face,cast,look,frame,cut}.
// Uses the measured word times (voice/words.json, so run `build.sh draft` once first: it stops at the storyboard lint AFTER the voice step)
// to cut each line into its shots at natural phrase breaks, >= 0.55 s each, and rewrites script.md with the inline {beats}. A backup is kept.
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parseScript } from '../../../core/script.js';
import { alignWords } from '../../../core/align.js';
import { placeBeats } from '../../../core/beats.js';

const [dir, sbFile] = process.argv.slice(2);
if (!dir || !sbFile) { console.error('usage: place-beats.mjs <film-dir> <storyboard.json>'); process.exit(2); }
if (!existsSync(join(dir, 'voice/words.json'))) { console.error('no voice/words.json: run build.sh draft once first (it stops at the storyboard lint after the voice step)'); process.exit(1); }
const blocks = parseScript(readFileSync(join(dir, 'script.md'), 'utf8'), { style: 'sketch' });
const asr = JSON.parse(readFileSync(join(dir, 'voice/words.json'), 'utf8')), sb = JSON.parse(readFileSync(sbFile, 'utf8'));
if (sb.length !== blocks.length) { console.error(`the storyboard has ${sb.length} lines but script.md has ${blocks.length} narration lines`); process.exit(1); }
const PUNCT_ONLY = /^[^\p{L}\p{N}]+$/u, D = o => Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== '').map(([k, v]) => `${k}=${Array.isArray(v) ? v.join(',') : v}`).join(' ');

const out = []; let total = 0, shots = 0;
blocks.forEach((b, i) => {
  const want = sb[i], words = alignWords(b.text, asr[b.id] || []);
  if (!words.length) throw new Error(`${b.id}: no word timings; rerun the voice step`);
  const idx = placeBeats(words, want.length), used = want.slice(0, idx.length + 1);
  if (used.length < want.length) console.warn(`${b.id}: the line fits only ${used.length} of ${want.length} shots (each shot needs >= 0.55 s); shorten the storyboard or lengthen the line`);
  const raw = b.text.split(/\s+/).filter(Boolean), rawOf = []; raw.forEach((t, r) => { if (!PUNCT_ONLY.test(t)) rawOf.push(r); });   // aligned index -> raw token position
  const at = new Map(idx.map((ai, k) => [rawOf[ai], used[k + 1]]));
  const text = raw.map((t, r) => (at.has(r) ? `{${D(at.get(r))}} ` : '') + t).join(' ');
  out.push(`[${D(used[0])}]\n${text}\n`); shots += used.length; total += words.at(-1).end;
});
copyFileSync(join(dir, 'script.md'), join(dir, 'script.md.bak'));
writeFileSync(join(dir, 'script.md'), out.join('\n'));
console.log(`placed ${shots} shots over ${blocks.length} lines (about ${(total / shots).toFixed(2)} s per shot). Backup: script.md.bak`);
