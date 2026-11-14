// Plan 5B Task 5 (D12): the animation stack under clip operations. Split: left keeps in / loop / an emphasis starting
// before the cut, right keeps out / loop / an emphasis starting after it (sourceless right halves shift `at` and
// `phase`), so every frame of both halves equals the original when the cut is outside the in/out/emphasis windows; a
// cut inside an entrance window leaves the right half at rest (the documented discontinuity). Trims: in/out follow the
// edges, sourceless start trims shift `at`/`phase`. Move/ripple/join/reframe/reset keep the stack; the detached audio
// twin gets none.
import { describe, expect, it } from 'vitest';
import { resolveClip } from '../src/core/animate';
import { detachAudio } from '../src/core/detachAudio';
import { reframeProject, joinClips } from '../src/core/merge';
import { clipEnd } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { motionWindows } from '../src/core/motion';
import type { ClipMotion, MotionSlot, PresetKey, PresetUse } from '../src/core/motionTypes';
import { PRESETS, PRESET_SCHEMA, presetEase, presetsForSlot } from '../src/core/presets';
import { deleteClip, moveClip, splitClip, trimClip } from '../src/core/timeline';
import { resetClipTransform } from '../src/core/transformEdits';
import { clipOf, k, mk, project, rng } from './keyframe-fixtures';

const FPS = 30;
const FMT = { width: 1920, height: 1080, fps: FPS };
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
/** Rotations compare modulo whole turns (Spin 360 / Spin loop wrap at half a cycle: ±180·T is the same picture). */
const turn = (d: number): number => {
  const m = ((d % 360) + 360) % 360;
  return m > 360 - 1e-7 ? 0 : m;
};
function same(a: Clip, b: Clip, where: string): void {
  for (const key of ['x', 'y', 'scale', 'opacity'] as const) {
    expect(near(a.transform[key], b.transform[key]), `${where} ${key} ${a.transform[key]} vs ${b.transform[key]}`).toBe(true);
  }
  const [ra, rb] = [turn(a.transform.rotation), turn(b.transform.rotation)];
  expect(Math.abs(ra - rb) < 1e-7 || Math.abs(Math.abs(ra - rb) - 360) < 1e-7, `${where} rotation ${a.transform.rotation} vs ${b.transform.rotation}`).toBe(true);
}
const withClip = (c: Clip): Project => {
  const p = project();
  return { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, clips: [c] } : t)) };
};
const frames = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let n = Math.ceil(from * FPS - 1e-9); n / FPS < to - 1e-9; n++) out.push(n / FPS);
  return out;
};
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
function randomUse(r: () => number, slot: MotionSlot, adjustment: boolean): PresetUse {
  const keys = presetsForSlot(slot).filter((key) => (!adjustment || PRESETS[key].opacityOnly) && key !== 'kenBurns');
  const preset: PresetKey = pick(r, keys);
  const params = Object.fromEntries(PRESET_SCHEMA[preset].params.map((d) => {
    const v = d.min + r() * (d.max - d.min);
    return [d.key, d.integer ? Math.round(v) : v];
  }));
  const ease = r() < 0.5 ? presetEase(preset, slot) : pick(r, [{ kind: 'linear' }, { kind: 'easeInOut' }, { kind: 'back' }, { kind: 'spring', spring: { stiffness: 200, damping: 6, mass: 1 } }] as const);
  return { preset, duration: 0.2 + Math.round(r() * 40) / 100, delay: Math.round(r() * 20) / 100, ease: { ...ease }, params };
}

/** A random clip whose stack fits (no short-clip scaling) with a frame-aligned cut outside every window. */
function randomCase(r: () => number): { clip: Clip; n: number } {
  const kind = pick(r, ['video', 'image', 'overlay', 'adjustment'] as const);
  const sourceless = kind === 'overlay' || kind === 'adjustment';
  const start = Math.round(r() * 2000) / 100 + r() * 0.01;
  const inn = sourceless ? 0 : Math.round(r() * 500) / 100;
  const dur = 2.5 + Math.round(r() * 300) / 100;
  const adj = kind === 'adjustment';
  const m: ClipMotion = {};
  if (r() < 0.8) m.in = randomUse(r, 'in', adj);
  if (r() < 0.8) m.out = randomUse(r, 'out', adj);
  if (r() < 0.8) m.emphasis = { ...randomUse(r, 'emphasis', adj), delay: 0, at: inn + Math.round(r() * dur * 100) / 100 - 0.2 };
  if (r() < 0.9) m.loop = { ...randomUse(r, 'loop', adj), delay: 0, duration: 0.1 + Math.round(r() * 150) / 100, phase: Math.round((r() * 6 - 3) * 100) / 100, count: r() < 0.5 ? null : 1 + Math.floor(r() * 4) };
  const clip = mk('c', { kind, mediaId: sourceless ? '' : 'm1', start, in: inn, out: inn + dur, motion: m, ...(adj ? { effects: [] } : {}) });
  const w = motionWindows(clip);
  const lo = w.in ? w.in.end : 0.1;
  const hi = w.out ? w.out.start : dur - 0.1;
  const options: number[] = [];
  for (let n = Math.ceil(Math.max(lo, 0.1) * FPS); n / FPS <= Math.min(hi, dur - 0.1); n++) {
    const local = (sourceless ? 0 : inn) + n / FPS;
    if (m.emphasis && m.emphasis.at < local && m.emphasis.at + m.emphasis.duration > local) continue;
    options.push(n);
  }
  return options.length > 0 ? { clip, n: pick(r, options) } : randomCase(r);
}

describe('split (D12)', () => {
  it('property: both halves are frame-exact when the cut is outside the in/out/emphasis windows (200 clips)', () => {
    const r = rng(2024);
    let sourcelessLoops = 0;
    for (let i = 0; i < 200; i++) {
      const { clip, n } = randomCase(r);
      const cut = clip.start + n / FPS;
      const q = splitClip(withClip(clip), 'c', cut);
      const [left, right] = q.tracks[0].clips;
      if (clip.motion!.loop && (clip.kind === 'overlay' || clip.kind === 'adjustment')) sourcelessLoops++;
      for (const f of frames(0, n / FPS)) same(resolveClip(left, clip.start + f, FMT), resolveClip(clip, clip.start + f, FMT), `#${i} left ${f}`);
      for (const f of frames(0, clipEnd(clip) - cut)) same(resolveClip(right, cut + f, FMT), resolveClip(clip, cut + f, FMT), `#${i} right ${f}`);
      expect(left.motion?.out).toBeUndefined();
      expect(right.motion?.in).toBeUndefined();
    }
    expect(sourcelessLoops).toBeGreaterThan(30);
  });

  it('assigns the emphasis to the half its window starts in; shifts a sourceless right half (at − d, phase + d)', () => {
    const e = { preset: 'pulse', duration: 0.5, delay: 0, ease: { kind: 'linear' }, params: { intensity: 0.2 }, at: 1 } as const;
    const l = { preset: 'float', duration: 1, delay: 0, ease: { kind: 'linear' }, params: { distance: 0.1 }, phase: 0.25, count: 3 } as const;
    const o = mk('o', { kind: 'overlay', mediaId: '', start: 20, in: 0, out: 4, motion: { emphasis: { ...e }, loop: { ...l } } });
    const [a, b] = splitClip(withClip(o), 'o', 22).tracks[0].clips;
    expect(a.motion).toEqual({ emphasis: e, loop: l });
    expect(b.motion).toEqual({ loop: { ...l, phase: 2.25 } });
    const late = withClip({ ...o, motion: { emphasis: { ...e, at: 3 } } });
    const [c, d] = splitClip(late, 'o', 22).tracks[0].clips;
    expect('motion' in c).toBe(false);
    expect(d.motion).toEqual({ emphasis: { ...e, at: 1 } });
    // Sourced: footage-anchored, unchanged.
    const v = mk('c', { motion: { emphasis: { ...e, at: 4.5 }, loop: { ...l } } });
    const [x, y] = splitClip(withClip(v), 'c', 12).tracks[0].clips;
    expect([x.motion, y.motion]).toEqual([{ loop: l }, { emphasis: { ...e, at: 4.5 }, loop: l }]);
    expect(x.motion!.loop).not.toBe(y.motion!.loop);
  });

  it('a cut inside an entrance window: the left half is frame-exact, the right half starts at rest (accepted discontinuity)', () => {
    const slide = { preset: 'slide', duration: 1, delay: 0, ease: { kind: 'linear' }, params: { direction: 0, distance: 1 } } as const;
    const c = mk('c', { motion: { in: { ...slide } } });
    const [left, right] = splitClip(withClip(c), 'c', 10.5).tracks[0].clips;
    for (const f of frames(0, 0.5)) same(resolveClip(left, 10 + f, FMT), resolveClip(c, 10 + f, FMT), `left ${f}`);
    expect(resolveClip(c, 10.5, FMT).transform.x).toBe(-960);
    expect(resolveClip(right, 10.5, FMT).transform).toBe(right.transform);
  });
});

describe('trim (D12)', () => {
  const stack: ClipMotion = {
    in: { preset: 'fade', duration: 0.5, delay: 0.1, ease: { kind: 'linear' }, params: {} },
    emphasis: { preset: 'wobble', duration: 1, delay: 0, ease: { kind: 'linear' }, params: { intensity: 20 }, at: 2.5 },
    loop: { preset: 'breathe', duration: 0.7, delay: 0, ease: { kind: 'linear' }, params: { intensity: 0.2 }, phase: 0.3, count: null },
    out: { preset: 'zoom', duration: 0.5, delay: 0, ease: { kind: 'linear' }, params: { from: 1.5 } },
  };

  it('in/out follow the edges; a sourced start trim keeps emphasis and loop on their footage', () => {
    const c = mk('c', { motion: stack });
    const p = trimClip(withClip(c), 'c', 'start', 10.4);
    const t = clipOf(p, 'c');
    expect(t.motion).toEqual(stack);
    expect(resolveClip(t, 10.4, FMT).transform.opacity).toBe(0);
    for (const f of [1, 1.2, 2.5]) same(resolveClip(t, 10 + f, FMT), resolveClip(c, 10 + f, FMT), `${f}`);
    const e = clipOf(trimClip(withClip(c), 'c', 'end', 13), 'c');
    expect(e.motion).toEqual(stack);
    expect(resolveClip(e, 13 - 1 / 30, FMT).transform.scale).toBeGreaterThan(1.4);
  });

  it('a sourceless start trim by Δ shifts at −= Δ and phase += Δ, so emphasis and loop stay put in timeline time', () => {
    const o = mk('o', { kind: 'overlay', mediaId: '', start: 20, in: 0, out: 4, motion: { emphasis: stack.emphasis, loop: stack.loop } });
    for (const to of [19.5, 20.3]) {
      const t = clipOf(trimClip(withClip(o), 'o', 'start', to), 'o');
      const d = to - 20;
      expect(t.motion!.emphasis!.at).toBeCloseTo(2.5 - d, 12);
      expect(t.motion!.loop!.phase).toBeCloseTo(0.3 + d, 12);
      for (const f of frames(0.5, 3.5)) same(resolveClip(t, 20 + f, FMT), resolveClip(o, 20 + f, FMT), `${to} ${f}`);
    }
  });
});

describe('other operations (D12)', () => {
  const stack: ClipMotion = {
    in: { preset: 'slide', duration: 0.5, delay: 0, ease: { kind: 'linear' }, params: { direction: 1, distance: 0.5 } },
    loop: { preset: 'spinLoop', duration: 2, delay: 0, ease: { kind: 'linear' }, params: { turns: 1 }, phase: -2, count: null },
  };

  it('move and ripple keep the stack and shift every frame with the clip', () => {
    const c = mk('c', { motion: stack, keys: { opacity: [k(2, 0.2), k(6, 1)] } });
    const moved = clipOf(moveClip(withClip(c), 'c', 15), 'c');
    expect(moved.motion).toEqual(stack);
    for (const f of frames(0, 4)) same(resolveClip(moved, 15 + f, FMT), resolveClip(c, 10 + f, FMT), `${f}`);
    const p = withClip(c);
    const two = { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, clips: [mk('x', { start: 0, in: 0, out: 3 }), c] } : t)) };
    const rippled = clipOf(deleteClip(two, 'x', { ripple: true }), 'c');
    expect(rippled.motion).toEqual(stack);
    expect(rippled.start).toBe(7);
  });

  it('join, reframe and reset transform keep the stack; the detached audio twin gets none', () => {
    const c = mk('c', { motion: stack });
    const p = withClip(c);
    const two = { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, clips: [mk('x', { start: 0, in: 0, out: 3 }), c] } : t)) };
    expect(clipOf(joinClips(two, ['x', 'c']), 'c').motion).toEqual(stack);
    const re = reframeProject(project({ motion: stack }), 'vertical');
    expect(clipOf(re, 'c').motion).toEqual(stack);
    const o = { ...project(), tracks: project().tracks.map((t) => (t.id === 'v' ? { ...t, clips: t.clips.map((x) => (x.id === 'o' ? { ...x, motion: stack } : x)) } : t)) };
    expect(clipOf(reframeProject(o, 'square'), 'o').motion).toEqual(stack);
    const moved = { ...c, transform: { ...c.transform, x: 50 } };
    expect(clipOf(resetClipTransform(withClip(moved), 'c'), 'c').motion).toEqual(stack);
    const d = detachAudio(project({ motion: stack }), 'c');
    const twin = d.tracks.flatMap((t) => t.clips).find((x) => x.kind === 'audio' && x.mediaId === 'm1' && x.id !== 'ac')!;
    expect('motion' in twin).toBe(false);
    expect(clipOf(d, 'c').motion).toEqual(stack);
  });
});
