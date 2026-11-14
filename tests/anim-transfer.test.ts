// Plan 5B Task 9: animation transfer (pure): keys copy/paste with relative timing, frame-window replacement and size
// adaptation; effect matching by type and occurrence; kind filters; atomic refusals; whole-animation replace and its
// round trip; user presets (relative position, exit anchored to the clip end, emphasis at the playhead).
import { describe, expect, it } from 'vitest';
import { copyAnimation, copyKeys, fitScale } from '../src/core/animPayload';
import { pasteAnimation, pasteKeys } from '../src/core/animTransfer';
import { keyRefsAt } from '../src/core/keyframeEdits';
import { MAX_KEYS } from '../src/core/keyframes';
import type { Clip, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { applyUserPreset, presetFromAnimation } from '../src/core/userPresets';
import { blur, clipOf, colour, emphasisOf, k, pk, project, useOf } from './anim-transfer.fixtures';

const refusal = (fn: () => unknown): string => {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(TimelineError); return (e as Error).message; }
  throw new Error('expected a TimelineError');
};
const refs = (p: Project, id: string, ...times: number[]) => times.flatMap((t) => keyRefsAt(clipOf(p, id), t));
const keyed = (over: Partial<Clip> = {}): Project => project({ V: {
  keys: { opacity: [k(0, 0), k(1, 1), k(2, 0.5)], position: [pk(0, 0, 0), pk(1, 100, 50, { out: { x: 10, y: 0 } }), pk(2, 200, 0)], scale: [k(0, 1), k(1, 2)] },
  ...over,
} });

describe('copyKeys', () => {
  it('relative to the earliest copied key; every target at the selected times; deep copies; refuses none', () => {
    const p = keyed();
    const pl = copyKeys(p, 'V', refs(p, 'V', 1, 2));
    expect(pl.targets.map((t) => (t.target as { prop: string }).prop).sort()).toEqual(['opacity', 'position', 'scale']);
    const op = pl.targets.find((t) => (t.target as { prop: string }).prop === 'opacity')!;
    expect(op.keys.map((x) => x.t)).toEqual([0, 1]);
    const pos = pl.targets.find((t) => (t.target as { prop: string }).prop === 'position')!;
    expect(pos.keys[0]).toMatchObject({ t: 0, x: 100, y: 50, out: { x: 10, y: 0 } });
    expect((pos.keys[0] as { out: object }).out).not.toBe((clipOf(p, 'V').keys!.position![1] as { out: object }).out);
    expect(refusal(() => copyKeys(p, 'V', []))).toMatch(/Select keyframes/);
  });
});

describe('pasteKeys', () => {
  it('the earliest key lands on the playhead frame, relative timing kept, on another clip, ONE project', () => {
    const p = keyed();
    const pl = copyKeys(p, 'V', refs(p, 'V', 1, 2));
    const dst = project({ V: {}, P: {} });
    const r = pasteKeys(dst, ['P'], pl, 11.5);
    const c = clipOf(r.project, 'P');
    expect(c.keys!.opacity!.map((x) => [x.t, x.v])).toEqual([[1.5, 1], [2.5, 0.5]]);
    expect(c.keys!.position!.map((x) => x.t)).toEqual([1.5, 2.5]);
    expect(r.skipped).toBe(0);
    expect(clipOf(dst, 'P').keys).toBeUndefined(); // input untouched
  });

  it('replaces a key in the same frame window and keeps the others', () => {
    const p = keyed();
    const pl = copyKeys(p, 'V', refs(p, 'V', 1));
    const dst = project({ V: { keys: { opacity: [k(0, 0), k(1.01, 0.3), k(3, 1)] } } });
    const r = pasteKeys(dst, ['V'], pl, 1); // playhead frame 30; the key at 1.01 is in frame 30 (30/30..31/30)
    const op = clipOf(r.project, 'V').keys!.opacity!;
    expect(op.map((x) => [x.t, x.v])).toEqual([[0, 0], [1, 1], [3, 1]]);
  });

  it('adapts scale keys by the fit-scale ratio (photo fill 0.5 -> video fill 1: x2, exact); positions stay in format px', () => {
    const photo = project({ P: { keys: { scale: [k(0, 0.5), k(1, 1)], position: [pk(0, 10, 20), pk(1, 30, 40)] } } });
    expect(fitScale(photo, clipOf(photo, 'P'))).toBe(0.5);
    expect(fitScale(photo, clipOf(photo, 'V'))).toBe(1);
    const pl = copyKeys(photo, 'P', refs(photo, 'P', 0, 1));
    const r = pasteKeys(photo, ['V'], pl, 1);
    const c = clipOf(r.project, 'V');
    expect(c.keys!.scale!.map((x) => [x.t, x.v])).toEqual([[1, 1], [2, 2]]);
    expect(c.keys!.position!.map((x) => [x.x, x.y])).toEqual([[10, 20], [30, 40]]);
    // And back (video -> photo) halves them again.
    const back = pasteKeys(project(), ['P'], copyKeys(r.project, 'V', refs(r.project, 'V', 1, 2)), 11);
    expect(clipOf(back.project, 'P').keys!.scale!.map((x) => x.v)).toEqual([0.5, 1]);
  });

  it('matches effect keys by type and occurrence; a missing effect is skipped and counted', () => {
    const b = [k(0, 0.1), k(1, 0.9)];
    const src = project({ V: { effects: [colour('c1'), colour('c2', { brightness: b })] } });
    const pl = copyKeys(src, 'V', refs(src, 'V', 0, 1));
    expect(pl.targets[0].target).toMatchObject({ kind: 'effect', type: 'colour', occurrence: 1, param: 'brightness' });
    const two = project({ V: { effects: [colour('d1'), colour('d2')] } });
    const r = pasteKeys(two, ['V'], pl, 1);
    const fx = clipOf(r.project, 'V').effects;
    expect(fx[0].keys).toBeUndefined();
    expect(fx[1].keys!.brightness.map((x) => x.v)).toEqual([0.1, 0.9]);
    const one = project({ V: { effects: [colour('e1')] } });
    const r1 = pasteKeys(one, ['V'], pl, 1);
    expect(r1.skipped).toBe(1);
    expect(r1.project).toBe(one);
    const wrong = project({ V: { effects: [blur('b1')] } });
    expect(pasteKeys(wrong, ['V'], pl, 1).skipped).toBe(1);
  });

  it('kind filters: adjustment takes opacity only, audio nothing; nothing pasted = the same project', () => {
    const p = keyed();
    const pl = copyKeys(p, 'V', refs(p, 'V', 0, 1));
    const dst = project();
    const adj = pasteKeys(dst, ['J'], pl, 10.5);
    expect(Object.keys(clipOf(adj.project, 'J').keys!)).toEqual(['opacity']);
    expect(adj.skipped).toBe(2); // position and scale
    const audio = pasteKeys(dst, ['AU'], pl, 1);
    expect(audio.project).toBe(dst);
    expect(audio.skipped).toBe(pl.targets.length);
  });

  it('keys that would land past the clip end are left out and counted', () => {
    const p = keyed();
    const pl = copyKeys(p, 'V', refs(p, 'V', 0, 1, 2));
    const r = pasteKeys(project(), ['V'], pl, 3); // clip is 0..4: keys at 3, 4(out), 5(out)
    expect(clipOf(r.project, 'V').keys!.opacity!.map((x) => x.t)).toEqual([3]);
    expect(r.skipped).toBeGreaterThan(0);
  });

  it('multi-clip paste is ONE project; a locked or off-clip destination refuses everything (nothing partial)', () => {
    const p = keyed();
    const pl = copyKeys(p, 'V', refs(p, 'V', 0, 1));
    const dst = project({ V: {}, P: {} });
    const r = pasteKeys(dst, ['V', 'O'], pl, 1);
    expect(clipOf(r.project, 'V').keys).toBeDefined();
    expect(clipOf(r.project, 'O').keys).toBeDefined();
    expect(r.project.tracks[2]).toBe(dst.tracks[2]); // untouched tracks keep identity
    expect(refusal(() => pasteKeys(dst, ['V', 'LC'], pl, 21))).toMatch(/locked/);
    expect(refusal(() => pasteKeys(dst, ['V', 'P'], pl, 1))).toMatch(/playhead onto the clip/); // P starts at 10
    expect(refusal(() => pasteKeys(dst, [], pl, 1))).toMatch(/Select a clip/);
  });

  it('refuses beyond MAX_KEYS', () => {
    const many = Array.from({ length: MAX_KEYS }, (_, i) => k(i * 0.001 + 0.5, 0.5));
    const dst = project({ V: { out: 4, keys: { opacity: many } } });
    const p = keyed();
    expect(refusal(() => pasteKeys(dst, ['V'], copyKeys(p, 'V', refs(p, 'V', 0)), 3))).toMatch(/At most 500/);
  });
});

describe('whole animation', () => {
  const rich = (): Project => project({ V: {
    keys: { position: [pk(0, 0, 0), pk(1, 100, 0)], scale: [k(0, 1), k(2, 1.5)], opacity: [k(0.5, 0), k(1, 1)], loops: { opacity: { mode: 'repeat', count: null } }, orient: true },
    effects: [colour('c1', { brightness: [k(0, 0), k(1, 0.5)] })],
    motion: { in: useOf('fade', 'in'), out: useOf('fade', 'out'), emphasis: emphasisOf('pulse', 1.5) },
  } });

  it('replaces the destination animation exactly; A -> B -> A round trip (same sizes) equals A', () => {
    const p = rich();
    const orig = clipOf(p, 'V');
    const pl = copyAnimation(p, 'V');
    const toB = pasteAnimation(project({ V: { start: 0 }, P: { mediaId: 'video', kind: 'video', start: 10, in: 1, out: 5, effects: [colour('p1')], keys: { opacity: [k(1, 0.1), k(2, 0.2)] }, motion: { loop: { ...useOf('breathe', 'loop'), phase: 0, count: null } } } }), ['P'], pl);
    const b = clipOf(toB.project, 'P');
    expect(b.keys!.opacity!.map((x) => x.t)).toEqual([1.5, 2]); // replaced, relative to B's visible start (in = 1)
    expect(b.motion!.loop).toBeUndefined(); // B's own loop preset is gone
    expect(b.motion!.emphasis!.at).toBe(2.5);
    expect(b.keys!.orient).toBe(true);
    // Back onto a clip whose visible start is the original's: equal.
    const back = pasteAnimation(project({ V: { effects: [colour('c9')] } }), ['V'], copyAnimation(toB.project, 'P'));
    const a = clipOf(back.project, 'V');
    expect(a.keys).toEqual(orig.keys);
    expect(a.motion).toEqual(orig.motion);
    expect(a.effects[0].keys).toEqual(orig.effects[0].keys);
  });

  it('the loop phase keeps its relation to the clip start across different footage offsets', () => {
    const src = project({ V: { in: 1, out: 5, motion: { loop: { ...useOf('breathe', 'loop', 2), phase: 0.3, count: null } } } });
    const r = pasteAnimation(project(), ['V'], copyAnimation(src, 'V')); // visible start 1 -> 0
    expect(clipOf(r.project, 'V').motion!.loop!.phase).toBeCloseTo(1.3, 12);
  });

  it('a no-op paste (onto itself) is the same project; the input is never mutated', () => {
    const p = rich();
    const snap = JSON.stringify(p);
    const r = pasteAnimation(p, ['V'], copyAnimation(p, 'V'));
    expect(r.project).toBe(p);
    expect(JSON.stringify(p)).toBe(snap);
  });

  it('adapts scale keys, applies kind rules (adjustment: opacity keys and fade only; audio refused) and counts skips', () => {
    const p = project({ P: { keys: { scale: [k(0, 0.5), k(1, 1)], opacity: [k(0, 0), k(1, 1)] }, motion: { in: useOf('slide', 'in') } } });
    const pl = copyAnimation(p, 'P');
    expect(pl.fit).toBe(0.5);
    const toV = pasteAnimation(p, ['V'], pl);
    expect(clipOf(toV.project, 'V').keys!.scale!.map((x) => x.v)).toEqual([1, 2]);
    const toJ = pasteAnimation(p, ['J'], pl);
    expect(Object.keys(clipOf(toJ.project, 'J').keys!)).toEqual(['opacity']);
    expect(clipOf(toJ.project, 'J').motion).toBeUndefined(); // slide moves: adjustment layers only fade
    expect(toJ.skipped).toBeGreaterThanOrEqual(2);
    expect(refusal(() => pasteAnimation(p, ['AU'], pl))).toMatch(/Audio/);
    expect(refusal(() => pasteAnimation(p, ['V', 'LC'], pl))).toMatch(/locked/);
  });

  it('refuses a clip without animation', () => {
    expect(refusal(() => copyAnimation(project(), 'V'))).toMatch(/no animation/);
  });
});

describe('user presets', () => {
  const slide = (): Project => project({ V: { keys: { position: [pk(0, 100, 50), pk(1, 400, 50)], opacity: [k(0, 0), k(1, 1)] } } });

  it('positions are stored relative to the first position key and applied relative to the destination rest position', () => {
    const p = slide();
    const preset = presetFromAnimation(copyAnimation(p, 'V'), '  Glide  ', 'in', 1, 'id1');
    expect(preset.name).toBe('Glide');
    expect(preset.payload.keys!.position!.map((x) => [(x as { x: number }).x, (x as { y: number }).y])).toEqual([[0, 0], [300, 0]]);
    const dst = project({ P: { transform: { x: 40, y: -10, scale: 1, rotation: 0, opacity: 1 }, mediaId: 'video', kind: 'video' } });
    const r = applyUserPreset(dst, 'P', preset, 10);
    expect(clipOf(r, 'P').keys!.position!.map((x) => [x.x, x.y])).toEqual([[40, -10], [340, -10]]);
    // The source clip is untouched and the project never references the library.
    expect(JSON.stringify(r)).not.toContain('id1');
  });

  it('exit presets anchor to the clip END, emphasis presets to the playhead, in/custom to the start', () => {
    const p = project({ V: { keys: { opacity: [k(0, 1), k(0.5, 0)] } } });
    const pl = copyAnimation(p, 'V'); // span 4: keys at rel 0, 0.5
    const out = applyUserPreset(project(), 'V', presetFromAnimation(pl, 'Out', 'out'), 0);
    expect(clipOf(out, 'V').keys!.opacity!.map((x) => x.t)).toEqual([4 - 4 + 0, 0.5]); // hi (4) - span (4) = 0: same length
    const short = project({ V: { out: 2 } });
    const out2 = applyUserPreset(short, 'V', presetFromAnimation(pl, 'Out', 'out'), 0);
    expect(clipOf(out2, 'V').keys!.opacity!.map((x) => x.t)).toEqual([-2, -1.5]); // anchored to the end: before the visible start
    const emph = applyUserPreset(project(), 'V', presetFromAnimation(pl, 'E', 'emphasis'), 2);
    expect(clipOf(emph, 'V').keys!.opacity!.map((x) => x.t)).toEqual([2, 2.5]);
    const start = applyUserPreset(project(), 'V', presetFromAnimation(pl, 'S', 'custom'), 2);
    expect(clipOf(start, 'V').keys!.opacity!.map((x) => x.t)).toEqual([0, 0.5]);
  });

  it('a damaged stored preset fails as a TimelineError (a toast), never an uncaught throw', () => {
    const preset = presetFromAnimation(copyAnimation(slide(), 'V'), 'Glide', 'in', 1, 'id1');
    (preset.payload.keys as Record<string, unknown>).position = 5;
    expect(refusal(() => applyUserPreset(project(), 'V', preset, 0))).toMatch(/damaged/);
  });

  it('validates the name, refuses empty animations and audio clips', () => {
    const pl = copyAnimation(slide(), 'V');
    expect(refusal(() => presetFromAnimation(pl, '   ', 'in'))).toMatch(/name/);
    expect(refusal(() => presetFromAnimation(pl, 'x'.repeat(41), 'in'))).toMatch(/at most 40/);
    expect(presetFromAnimation(pl, 'x'.repeat(40), 'in').name).toHaveLength(40);
    expect(refusal(() => presetFromAnimation({ ...pl, keys: undefined }, 'N', 'in'))).toMatch(/no animation/);
    expect(refusal(() => applyUserPreset(project(), 'AU', presetFromAnimation(pl, 'N', 'in'), 0))).toMatch(/Audio/);
  });
});
