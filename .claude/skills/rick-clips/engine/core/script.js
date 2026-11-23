// Script → timeline. A script is blocks: a [key=value ...] directive line, then the narration for that shot.
//   [set=cellblock cam=face face=smug overlay=cctv cut=fade]
// Each block is voiced as its own line, so a shot starts exactly on its first spoken word (hard cuts land on words).
import { CLASSIC_VOCAB, DIRECTIVE_KEYS } from './vocab.js';
// Each style's page can only draw its own transitions; anything else would render black frames, so it is rejected here.
const CUTS_BY_STYLE = { classic: ['cut', 'fade', 'cctv', 'whip', 'punch'], sketch: ['cut', 'fade', 'whip', 'flip', 'ink', 'scribble'] };

/** text → [{id, set, cam, face, overlay, transition, text}]. Transition: explicit cut=… wins; else overlay=cctv → cctv;
 *  else a set change → fade; else a move into a close-up (cam=face) → punch; else whip. A bare hard cut only when the script says cut=cut. `set` carries over from the previous shot. */
const PUNCT_ONLY = /^[^\p{L}\p{N}]+$/u;
const parseKV = str => Object.fromEntries(str.trim().split(/\s+/).filter(Boolean).map(kv => { const i = kv.indexOf('='); return i < 0 ? [kv, ''] : [kv.slice(0, i), kv.slice(i + 1)]; }));
/** Narration with inline beat tags: "Rosa {cam=face} opened" → text without tags + beats [{at: index of the next spoken word, d: directives}]. */
function splitBeats(text) {
  const beats = [], words = []; let idx = 0;
  for (const part of text.split(/(\{[^}]*\})/)) {
    if (part.startsWith('{') && part.endsWith('}')) beats.push({ at: idx, d: parseKV(part.slice(1, -1)) });
    else for (const tok of part.trim().split(/\s+/).filter(Boolean)) { words.push(tok); if (!PUNCT_ONLY.test(tok)) idx++; }
  }
  return { text: words.join(' '), beats };
}

export function parseScript(src, { style = 'classic' } = {}) {
  const shots = [];
  let cur = null;
  for (const raw of src.split(/\r?\n/)) {
    const line = raw.trim();
    const m = /^\[(.+)\]$/.exec(line);
    if (m) {
      const d = Object.fromEntries(m[1].trim().split(/\s+/).map(kv => { const i = kv.indexOf('='); return i < 0 ? [kv, ''] : [kv.slice(0, i), kv.slice(i + 1)]; }));
      cur = { id: `shot-${String(shots.length + 1).padStart(2, '0')}`, d, parts: [] };
      shots.push(cur);
    } else if (line) {
      if (!cur) throw new Error('script must start with a [directive] line');
      cur.parts.push(line);
    }
  }
  let prevSet = null;
  return shots.map(({ id, d, parts }) => {
    if (!parts.length) throw new Error(`${id} has no text`);
    for (const k of Object.keys(d)) if (!DIRECTIVE_KEYS.includes(k)) throw new Error(`${id}: unknown directive "${k}" (use ${DIRECTIVE_KEYS.join(', ')})`);
    const set = d.set || prevSet;
    if (!set) throw new Error(`${id} needs set=… (first shot must name its set)`);
    if (d.cut !== undefined && !CUTS_BY_STYLE[style].includes(d.cut)) throw new Error(`${id}: unknown cut "${d.cut}" (use ${CUTS_BY_STYLE[style].join(', ')})`);
    const overlay = d.overlay || (d.cut === 'cctv' ? 'cctv' : null);   // cut=cctv and overlay=cctv are the same thing
    const transition = d.cut ?? (overlay === 'cctv' ? 'cctv' : !prevSet ? 'cut' : style === 'sketch' ? (set !== prevSet ? 'flip' : (d.cam || 'push') === 'face' ? 'ink' : 'scribble') : set !== prevSet ? 'fade' : (d.cam || 'push') === 'face' ? 'punch' : 'whip');
    prevSet = set;
    const { text, beats } = splitBeats(parts.join(' '));
    for (const b of beats) {
      for (const k of Object.keys(b.d)) if (!DIRECTIVE_KEYS.includes(k)) throw new Error(`${id}: unknown directive "${k}" (use ${DIRECTIVE_KEYS.join(', ')})`);
      if (b.d.cut !== undefined && !CUTS_BY_STYLE[style].includes(b.d.cut)) throw new Error(`${id}: unknown cut "${b.d.cut}" (use ${CUTS_BY_STYLE[style].join(', ')})`);
    }
    return { id, beats, set, cam: d.cam || 'push', face: d.face || 'flat', overlay, cast: d.cast ? d.cast.split(',') : [], look: d.look || null, frame: d.frame || null, transition, text };
  });
}

/** durations[i] = seconds of voice for shot i. Shot i spans [t0,t1); the last shot gets a tail. voiceT0 = t0 (voice starts on the cut). */
export function compileTimeline(shots, durations, { gap = 0.15, tail = 0.6 } = {}) {
  let t = 0;
  return shots.map((s, i) => {
    const t0 = t, last = i === shots.length - 1;
    const t1 = t0 + durations[i] + (last ? tail : gap);
    t = t1;
    return { ...s, t0: round(t0), t1: round(t1), voiceT0: round(t0) };
  });
}

/** Per-shot word timings (relative to each line) → one absolute list for captions. */
export function wordsFromLines(timeline, wordsByLine) {
  return timeline.flatMap((s, i) => wordsByLine[i].map(w => ({ text: w.text, start: round(s.voiceT0 + w.start), end: round(s.voiceT0 + w.end) })));
}
const round = x => Math.round(x * 1e6) / 1e6;

/** Throws a script error naming the first shot that uses an unknown set, camera, face, cast member or overlay. */
export function validateShots(shots, setNames, vocab = CLASSIC_VOCAB) {
  for (const s of shots) {
    if (!setNames.includes(s.set)) throw new Error(`${s.id}: unknown set "${s.set}" (use ${setNames.join(', ')})`);
    if (!vocab.cams.includes(s.cam)) throw new Error(`${s.id}: unknown cam "${s.cam}" (use ${vocab.cams.join(', ')})`);
    if (!vocab.faces.includes(s.face)) throw new Error(`${s.id}: unknown face "${s.face}" (use ${vocab.faces.join(', ')})`);
    for (const c of s.cast) if (!vocab.cast.includes(c)) throw new Error(`${s.id}: unknown cast "${c}" (use ${vocab.cast.join(', ')})`);
    if (s.look && !(vocab.looks && vocab.looks[s.set] && vocab.looks[s.set][s.look])) throw new Error(`${s.id}: unknown look "${s.look}" for set ${s.set} (use ${Object.keys((vocab.looks || {})[s.set] || {}).join(', ') || 'none'})`);
    if (s.frame && !['left', 'right', 'center'].includes(s.frame)) throw new Error(`${s.id}: unknown frame "${s.frame}" (use left, right, center)`);
    if (s.overlay && !vocab.overlays.includes(s.overlay)) throw new Error(`${s.id}: unknown overlay "${s.overlay}" (use ${vocab.overlays.length ? vocab.overlays.join(', ') : 'none'})`);
  }
}

const QUICK_CUTS = ['whip', 'scribble', 'ink'];   // set changes inside a voice line: fast (a page turn takes 0.6 s and would swallow a ~1 s shot)
const CAM_CYCLE = { classic: ['push', 'face', 'high', 'low', 'wide'], sketch: ['push', 'truck', 'face', 'pull', 'crane', 'dutch'] };
/** Split each block into its beats using the spoken word times. blocks: compiled timeline blocks; blockWords[i]: that block's words
 *  [{text,start,end}] in absolute time. A beat starts its shot ON its word, inherits everything from the shot before it, and without
 *  cam= gets the next camera in a cycle (never the same twice, so the camera always changes). Hard cut by default; a set change uses
 *  the style's page transition; cut= overrides. A shot under 0.5 s is refused. */
export function expandBeats(blocks, blockWords, { style = 'classic' } = {}) {
  const cycle = CAM_CYCLE[style], out = []; let setChanges = 0;
  blocks.forEach((b, bi) => {
    if (!b.beats || !b.beats.length) { out.push(b); return; }
    const w = blockWords[bi], segs = [{ at: 0, d: {} }];
    for (const bt of b.beats) (bt.at === 0 ? Object.assign(segs[0].d, bt.d) : segs.push({ at: bt.at, d: { ...bt.d } }));
    let cur = { set: b.set, cam: b.cam, face: b.face, cast: b.cast, overlay: b.overlay, look: b.look || null, frame: b.frame || null };
    segs.forEach((sg, j) => {
      const prev = { ...cur };
      cur.look = j === 0 ? cur.look : (sg.d.look || null);   // a look is an insert: it applies to its own beat only
      cur.frame = j === 0 ? cur.frame : (sg.d.frame || null);   // so is a framing (left/right third)
      if (j === 0 && sg.d.look) cur.look = sg.d.look;
      if (sg.d.set) cur.set = sg.d.set;
      if (sg.d.face) cur.face = sg.d.face;
      if (sg.d.cast) cur.cast = sg.d.cast.split(',');
      if (sg.d.overlay !== undefined) cur.overlay = sg.d.overlay || null;
      if (sg.d.cam) cur.cam = sg.d.cam; else if (j > 0) cur.cam = cycle[(Math.max(0, cycle.indexOf(prev.cam)) + 1) % cycle.length];
      if (j > 0 && sg.at >= w.length) throw new Error(`${b.id}: a beat is placed after the last spoken word`);
      const t0 = j === 0 ? b.t0 : w[sg.at].start, next = segs[j + 1], t1 = next ? w[next.at].start : b.t1;
      if (t1 - t0 < 0.5) throw new Error(`${b.id}: the beat at word ${j === 0 ? 0 : sg.at} leaves a shot under 0.5 s (${(t1 - t0).toFixed(2)} s); merge or move the beat`);
      const transition = j === 0 ? b.transition : (sg.d.cut ?? (cur.set !== prev.set ? (style === 'sketch' ? QUICK_CUTS[setChanges++ % QUICK_CUTS.length] : 'fade') : 'cut'));
      const text = w.slice(sg.at, next ? next.at : w.length).map(x => x.text).join(' ');
      out.push({ ...b, ...cur, id: `${b.id}${String.fromCharCode(97 + j)}`, t0, t1, transition, text, beats: undefined });
    });
  });
  return out;
}
