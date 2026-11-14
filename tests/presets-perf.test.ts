// Plan 5B Task 10: cost and determinism guards for the animation presets. The resolver with EVERY clip also carrying a
// curved (tangent) position path, a key loop and four presets stays within 2.5x the 5A measurement (about 1.8x measured) of the same keys
// (plan §9; measured on the same machine in the same run, so load cancels out), a static clip still resolves to itself,
// shake/jitter are pure functions of the time (no state: any evaluation order gives the same numbers), and one animated
// preview tile costs a sliver of a frame. Numbers are printed.
import { describe, expect, it } from 'vitest';
import { resolveClip } from '../src/core/animate';
import type { Clip, Keyframe, PositionKeyframe } from '../src/core/model';
import { PRESET_KEYS, presetsForSlot } from '../src/core/presets';
import { MOTION_SLOTS } from '../src/core/motionTypes';
import { previewFrame, previewLength } from '../src/ui/presetPreview';
import { emphasis, loop, use } from './e2e/preset-helpers';
import { colourFx, k, mk, pk, rng } from './keyframe-fixtures';

const FPS = 30;
const FMT = { width: 1920, height: 1080, fps: FPS };
const CLIPS = 16;
const DURATION = 20;
const KEYS = 500;

const scalarKeys = (n: number, r: () => number, lo: number, hi: number, span: number): Keyframe[] => {
  const kinds = ['linear', 'easeInOut', 'back', 'hold', 'bezier'] as const;
  return Array.from({ length: n }, (_, i) => {
    const kind = kinds[i % kinds.length];
    const ease = kind === 'bezier' ? { kind, bezier: [0.3, -0.2, 0.6, 1.3] as [number, number, number, number] } : { kind };
    return k((i * span) / n, lo + r() * (hi - lo), ease);
  });
};

/** `curved` gives every position key tangents (a smooth path: 32 Bézier samples per segment evaluation). */
const positionKeys = (n: number, r: () => number, span: number, curved: boolean): PositionKeyframe[] =>
  Array.from({ length: n }, (_, i) => {
    const key = pk((i * span) / n, r() * 1000 - 500, r() * 600 - 300, { kind: i % 2 ? 'easeOut' : 'linear' });
    return curved ? { ...key, in: { x: -40 - r() * 60, y: r() * 80 - 40 }, out: { x: 40 + r() * 60, y: r() * 80 - 40 } } : key;
  });

/**
 * The 5A baseline (`full` = false): six animated properties over the whole clip. The 5B twin (`full` = true): the same
 * counts over the first half (keys end at 10 s so the loops actually engage for the second half), curved position,
 * Repeat loops on scale and opacity, orient, and all four preset slots.
 */
function clip(id: string, seed: number, full: boolean): Clip {
  const r = rng(seed);
  const span = full ? DURATION / 2 : DURATION;
  const base = mk(id, {
    start: 0, in: 0, out: DURATION,
    keys: {
      position: positionKeys(KEYS, r, span, full), scale: scalarKeys(KEYS, r, 0.2, 3, span),
      rotation: scalarKeys(KEYS, r, -720, 720, span), opacity: scalarKeys(KEYS, r, 0, 1, span),
      ...(full ? { loops: { scale: { mode: 'repeat' as const, count: null }, opacity: { mode: 'pingPong' as const, count: null } }, orient: true as const } : {}),
    },
    effects: [colourFx(`fx-${id}`, { keys: { brightness: scalarKeys(KEYS, r, -1, 1, span), contrast: scalarKeys(KEYS, r, -1, 1, span) } })],
  });
  return full
    ? { ...base, motion: { in: use('pop', 'in'), emphasis: emphasis('shake', 6), loop: loop('breathe'), out: use('slide', 'out') } }
    : base;
}

const set = (full: boolean): Clip[] => Array.from({ length: CLIPS }, (_, i) => clip(`c${i}`, 1000 + i, full));

let sink = 0;

function bestPerFrame(frame: (t: number) => void, frames = 400, batches = 9): number {
  let best = Infinity;
  for (let b = 0; b < batches; b++) {
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) frame(((i * 7919) % (DURATION * FPS)) / FPS + 0.004);
    best = Math.min(best, (performance.now() - t0) / frames);
  }
  return best;
}

const resolveFrame = (list: Clip[]) => (t: number): void => {
  for (const c of list) {
    const r = resolveClip(c, t, FMT);
    sink += r.transform.x + r.transform.rotation + r.effects[0].params.brightness;
  }
};

describe('resolver cost with presets, loops and curved paths (16 clips)', () => {
  it('stays within 2.5x the 5A measurement (about 1.8x measured) and the 0.4 ms budget (best of 9 batches)', () => {
    const a5 = set(false);
    const b5 = set(true);
    bestPerFrame(resolveFrame(a5), 200, 2);
    bestPerFrame(resolveFrame(b5), 200, 2);
    const ms5a = bestPerFrame(resolveFrame(a5));
    const ms5b = bestPerFrame(resolveFrame(b5));
    console.log(
      `resolveClip, 16 clips x 500 keys x 6 properties: 5A ${(ms5a * 1000).toFixed(1)} µs, with curved path + loops + orient + 4 presets ` +
        `${(ms5b * 1000).toFixed(1)} µs (x${(ms5b / ms5a).toFixed(2)}) [sink ${sink !== 0 ? '+' : '-'}]`,
    );
    // Plan §9 asks for at most 2x the 5A measurement (same machine, same run). Measured 1.6-2.1x over ten runs (the curved
    // path, four slots and orient are real extra work), so the guard is 2.5x (Ruling T10-1); absolute guard 2x the 5A 0.2 ms.
    expect(ms5b / ms5a).toBeLessThanOrEqual(2.5);
    expect(ms5b).toBeLessThan(0.4);
  });

  it('a static or 5A-only clip is returned as itself (no allocation, no work)', () => {
    const still = mk('s', { start: 0, in: 0, out: DURATION, effects: [colourFx('f')] });
    expect(resolveClip(still, 3, FMT)).toBe(still);
    const empty = mk('e', { start: 0, in: 0, out: DURATION, motion: {} });
    expect(resolveClip(empty, 3, FMT).transform).toEqual(empty.transform);
  });

  it('is a pure function of the time: any evaluation order (and shake/jitter seeds) gives the same pictures', () => {
    const list = set(true).slice(0, 4).map((c, i) => ({
      ...c,
      motion: { ...c.motion, emphasis: emphasis(i % 2 ? 'shake' : 'wobble', 6, { params: i % 2 ? { seed: 77 + i } : {} }), loop: loop(i % 2 ? 'jitter' : 'float', { params: i % 2 ? { seed: 5 } : {} }) },
    }));
    const times = Array.from({ length: 150 }, (_, i) => i / FPS);
    const asc = list.map((c) => times.map((t) => JSON.stringify(resolveClip(c, t, FMT))));
    const r = rng(3);
    const order = times.map((_, i) => i).sort(() => r() - 0.5);
    list.forEach((c, ci) => { for (const i of order) expect(JSON.stringify(resolveClip(c, times[i], FMT)), `clip ${ci} frame ${i}`).toBe(asc[ci][i]); });
    // The same evaluation twice (a second call, a fresh run of the same clip object) is identical too.
    for (const [ci, c] of list.entries()) expect(JSON.stringify(resolveClip(c, 4.2, FMT))).toBe(asc[ci][Math.round(4.2 * FPS)]);
  });
});

describe('preview tile CPU', () => {
  it('one animated tile at 30 fps costs well under 1 ms per second of animation; all 28 stills draw in a few ms', () => {
    const slots = MOTION_SLOTS.flatMap((slot) => presetsForSlot(slot).map((key) => [key, slot] as const));
    expect(slots.length).toBe(PRESET_KEYS.reduce((n, key) => n + MOTION_SLOTS.filter((s) => presetsForSlot(s).includes(key)).length, 0));
    // Warm up, then the worst tile's best per-frame cost over a full preview loop (30 fps).
    let worst = 0;
    for (let round = 0; round < 2; round++) {
      worst = 0;
      for (const [key, slot] of slots) {
        const frames = Math.round(previewLength(key, slot) * 30);
        let best = Infinity;
        for (let b = 0; b < 5; b++) {
          const t0 = performance.now();
          for (let i = 0; i < frames; i++) sink += previewFrame(key, slot, i / 30).opacity;
          best = Math.min(best, (performance.now() - t0) / frames);
        }
        worst = Math.max(worst, best);
      }
    }
    const t0 = performance.now();
    for (const [key, slot] of slots) sink += previewFrame(key, slot, 0.3).opacity;
    const all = performance.now() - t0;
    console.log(`tile corners: worst ${(worst * 1000).toFixed(1)} µs per frame (one tile at 30 fps = ${(worst * 30).toFixed(2)} ms per second); ${slots.length} stills ${all.toFixed(2)} ms`);
    expect(worst * 30).toBeLessThan(1); // under 0.1 % of a second of CPU for the geometry
    expect(all).toBeLessThan(25);
  });
});
