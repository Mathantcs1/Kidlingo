// Plan 5 D7 reader audit: every read of `.transform`, `.params` or `.effects` (and every destructuring of them) in
// src/render/** and src/ui/** must be listed below with why it is right. Pictures are evaluated in ONE place
// (collectDraws resolves each clip once per frame), so a render-side reader must see a RESOLVED clip; a UI reader either
// reads the resolved value at the playhead or reads the stored value on purpose. A new, unlisted reader fails this test:
// decide which it is, then list it. Each entry must match EXACTLY ONE source line (or carry an explicit count as a 4th
// element), so a second identical reader in the same file fails too; an entry that matches nothing fails as stale.
// Known blind spot: a destructuring that spans several lines (`const {\n transform,\n} = clip`) is not detected (matching
// a bare `transform,` line would flag every object-literal shorthand); single-line and parameter destructuring are.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, it, expect } from 'vitest';

const ROOT = join(__dirname, '..');

/** [file, a substring of the reading line, why, expected match count (default 1)]. One entry per reading line. */
type Allowed = [string, string, string, number?];
const ALLOWED: Allowed[] = [
  // ---- src/render: the compositor. Draw.clip / AdjustmentDraw.clip are resolved in collectDraws (drawCollect.ts).
  ['src/render/compositor.ts', 'const { opacity } = d.clip.transform', 'reads resolved clip (Draw.clip)'],
  ['src/render/compositor.ts', 'clipMatrix(d.size, d.clip.transform, format)', 'reads resolved clip (Draw.clip)'],
  ['src/render/clipEffects.ts', "d.clip.kind === 'overlay' || !d.clip.effects", 'reads resolved clip (Draw.clip)'],
  ['src/render/clipEffects.ts', 'd.uv, d.clip.effects, ctx', 'reads resolved clip (Draw.clip): evaluated params'],
  ['src/render/adjustment.ts', '(clip.effects ?? []).some((e) => e.enabled)', 'reads resolved clip (AdjustmentDraw.clip): enabled is never animated'],
  ['src/render/adjustment.ts', 'COMPOSITE_UV, clip.effects, ctx', 'reads resolved clip (AdjustmentDraw.clip): evaluated params'],
  ['src/render/adjustment.ts', 'clip.transform.opacity', 'reads resolved clip (AdjustmentDraw.clip): evaluated opacity'],
  ['src/render/effects/pipeline.ts', 'shader.run({ draw: pass }, effect.params', 'reads resolved clip (the stack handed in by clipEffects/adjustment)'],
  ['src/render/effects/pipeline.ts', 'pass(shader.uniforms(effect.params', 'reads resolved clip (the stack handed in by clipEffects/adjustment)'],
  ['src/render/effects/luts.ts', 'for (const c of clips) for (const e of c.effects ?? [])', 'reads resolved clip (draws): only type/enabled/ref, never animated'],
  ['src/render/effects/luts.ts', 't.clips.flatMap((c) => (c.effects ?? []).map((e) => e.ref))', 'reads stored value on purpose: LUT refs in use (not animated)'],
  ['src/render/effects/unavailable.ts', "if (c.kind !== 'overlay') for (const e of c.effects ?? [])", 'reads stored value on purpose: effect types in use (not animated)'],
  ['src/render/effects/unavailable.ts', 'if (s.effects.length > 0)', 'not a clip: ExportSkips summary'],
  ['src/render/effects/unavailable.ts', 's.effects.map((t) => VIDEO_EFFECTS[t].label)', 'not a clip: ExportSkips summary'],
  // ---- src/ui: inspectors, on-canvas handles and commands.
  ['src/ui/effectParams.tsx', '(effect.params[key] ?? fallback)', 'reads resolved value at the playhead when animated (targetValueAt), the stored value on purpose when not'],
  ['src/ui/VideoEffectRow.tsx', 'schema.params.filter(', 'not a clip: effect schema'],
  ['src/ui/EffectRow.tsx', 'const stored = effect.params[def.key]', 'reads stored value on purpose: audio effects are not animated in 5A'],
  ['src/ui/EffectRow.tsx', 'schema.params.map(', 'not a clip: audio effect schema'],
  ['src/ui/EffectList.tsx', 'clip.audio.effects', 'reads stored value on purpose: audio effects are not animated in 5A'],
  ['src/ui/EffectsInspector.tsx', 'clip.effects.length > 0', 'reads stored value on purpose: the stack itself (ids, order), not params'],
  ['src/ui/EffectsInspector.tsx', 'clip.effects.map((e, i)', 'reads stored value on purpose: the stack itself (ids, order), not params'],
  ['src/ui/EffectsInspector.tsx', 'count={clip.effects.length}', 'reads stored value on purpose: the stack itself (ids, order), not params'],
  // Task 6: TransformFields shows `resolvedTransform(clip, playhead, fps)` (no direct read); Preview previews a drag
  // through `withLiveValue(project, clipId, patch, t)` (no direct read).
  ['src/ui/overlayHit.ts', 'clipCorners(target.size, target.transform, format)', 'hit box from the target transform: resolved at the playhead by TransformOverlay (or the live drag)'],
  ['src/ui/useTransformDrag.ts', 'storeTransform: clip.transform', 'reads stored value on purpose: detects an external store change (drag start = resolvedTransform at the playhead)'],
  ['src/ui/useTransformDrag.ts', 'now.transform !== g.storeTransform', 'reads stored value on purpose: detects an external store change'],
  ['src/ui/TransformOverlay.tsx', 'live ? live.transform : resolvedTransform(target.clip', 'handles at the live drag transform, else the resolved transform at the playhead'],
  ['src/ui/TransformOverlay.tsx', 'clipCorners(target.size, target.transform, format)', 'handles at the target transform (resolved at the playhead, or the live drag)'],
  ['src/ui/edits.ts', 'rotation: c.transform.rotation, opacity: c.transform.opacity', 'reads stored value on purpose: setClipFit keeps the static rotation/opacity'],
  ['src/ui/mediaEdits.ts', '(c.effects ?? []).some((e) => e.ref === mediaId)', 'reads stored value on purpose: LUT media in use (not animated)'],
];

/** A property read (`x.transform`, `x?.params`, not a call like `this.effects.run`) or a destructuring of one. */
const READ = /\??\.(transform|params|effects)\b(?!\s*\()/;
const DESTRUCTURE = /\{[^}]*\b(transform|params|effects)\b[^}]*\}\s*=[^=>]/;
/** Parameter destructuring: `({ transform }: Clip) =>`, `function f({ effects }: P)`. */
const PARAM_DESTRUCTURE = /[(,]\s*\{[^}]*\b(transform|params|effects)\b[^}]*\}\s*:/;
/** Members of the compositor/pipeline objects named `effects`, not clip data. */
const NOT_CLIP = /\bthis\.effects\b/g;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) ? [path] : [];
  });
}

interface Finding { file: string; line: number; text: string }

function findReaders(sources: { file: string; text: string }[]): Finding[] {
  const out: Finding[] = [];
  for (const { file, text } of sources) {
    text.split('\n').forEach((raw, i) => {
      const code = raw.replace(/\/\/.*$/, '').replace(NOT_CLIP, '');
      if (/^\s*(\*|\/\*)/.test(raw)) return; // doc comments
      if (READ.test(code) || DESTRUCTURE.test(code) || PARAM_DESTRUCTURE.test(code)) out.push({ file, line: i + 1, text: raw.trim() });
    });
  }
  return out;
}

/** Findings with no allowlist entry, and entries whose match count differs from the expected one. */
function audit(findings: Finding[], allowed: Allowed[]): { unlisted: Finding[]; stale: string[] } {
  const counts = allowed.map(() => 0);
  const unlisted = findings.filter((f) => {
    const i = allowed.findIndex(([file, snippet]) => file === f.file && f.text.includes(snippet));
    if (i < 0) return true;
    counts[i]++;
    return false;
  });
  const stale = allowed.flatMap(([file, snippet, , n = 1], i) => (counts[i] === n ? [] : [`${file}: ${snippet} (expected ${n}, found ${counts[i]})`]));
  return { unlisted, stale };
}

function scan(): Finding[] {
  const sources = ['src/render', 'src/ui'].flatMap((d) => files(join(ROOT, d)))
    .map((path) => ({ file: relative(ROOT, path).split('\\').join('/'), text: readFileSync(path, 'utf8') }));
  return findReaders(sources);
}

describe('transform/params/effects reader audit (D7)', () => {
  it('every reader in src/render and src/ui is listed, and every listed entry still exists', () => {
    const { unlisted, stale } = audit(scan(), ALLOWED);
    expect(unlisted.map((f) => `${f.file}:${f.line}: ${f.text}`), 'unlisted readers').toEqual([]);
    expect(stale, 'stale allowlist entries').toEqual([]);
  });

  it('every entry says why (resolved clip, stored value, or not a clip)', () => {
    for (const [, , why] of ALLOWED) expect(why).toMatch(/resolved|stored|not a clip|live drag|drag start|handles|hit box/);
  });

  it('catches a new read, a destructuring, and an optional-chain read (the detector itself)', () => {
    const fake = (text: string) => findReaders([{ file: 'src/render/new.ts', text }]);
    expect(fake('const m = clip.transform.scale;')).toHaveLength(1);
    expect(fake('const { transform } = clip;')).toHaveLength(1);
    expect(fake('const s = c?.effects;')).toHaveLength(1);
    expect(fake('const v = e.params[k];')).toHaveLength(1);
    expect(fake('const f = ({ transform }: Clip) => transform.x;')).toHaveLength(1);
    expect(fake('function g(a: number, { effects }: Props) {')).toHaveLength(1);
    expect(fake('this.effects.run(a);\n// clip.transform in a comment\n * clip.transform in a doc')).toHaveLength(0);
    expect(fake('return { ...rest, transform: t };')).toHaveLength(0);
    // A dummy read in a real render file is unlisted.
    const { unlisted } = audit([...scan(), { file: 'src/render/compositor.ts', line: 999, text: 'const s = clip.transform.scale;' }], ALLOWED);
    expect(unlisted).toHaveLength(1);
    // A second identical reader next to a listed one is caught (each entry matches exactly one line).
    const dup = { file: 'src/render/adjustment.ts', line: 998, text: 'const o = clip.transform.opacity;' };
    expect(audit([...scan(), dup], ALLOWED).stale.join()).toContain('clip.transform.opacity');
  });
});
