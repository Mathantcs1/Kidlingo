// make-lines.mjs <script.md> <lines.json> — one TTS line per script block (id = shot id)
import { readFileSync, writeFileSync } from 'node:fs';
import { parseScript } from './stickset/script.js';
const [src, out] = process.argv.slice(2);
const lines = parseScript(readFileSync(src, 'utf8')).map(s => ({ id: s.id, text: s.text, voice: process.env.VOICE || 'bm_george', speed: +(process.env.SPEED || 0.95) }));
writeFileSync(out, JSON.stringify(lines, null, 1));
console.log(`${lines.length} lines`);
