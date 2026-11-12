// Plan 5 Task 11: keyframe evaluation cost and save size. resolveClip for 16 clips × 6 animated properties × 500 keys
// per frame, guarded RELATIVE to a measured reference loop on the same machine (an absolute budget flakes on a loaded
// machine), plus a growth guard (binary search: 500 keys cost about what 5 keys cost) and the plan's 0.2 ms budget on
// the best batch. Autosave size grows linearly with the key count (≈ 60 bytes per key). Numbers are printed.
import { describe, expect, it } from 'vitest';
import { resolveClip } from '../src/core/animate';
import type { Clip, Keyframe, PositionKeyframe, Project } from '../src/core/model';
import { colourFx, k, mk, pk, project, rng } from './keyframe-fixtures';

const FPS = 30;
const CLIPS = 16;
const DURATION = 20;

/** `n` keys spread over [0, DURATION), whole frames apart where possible, with assorted eases. */
function scalarKeys(n: number, r: () => number, lo: number, hi: number): Keyframe[] {
  const kinds = ['linear', 'easeInOut', 'back', 'hold', 'bezier'] as const;
  return Array.from({ length: n }, (_, i) => {
    const kind = kinds[i % kinds.length];
    const ease = kind === 'bezier' ? { kind, bezier: [0.3, -0.2, 0.6, 1.3] as [number, number, number, number] } : { kind };
    return k((i * DURATION) / n, lo + r() * (hi - lo), ease);
  });
}

function positionKeys(n: number, r: () => number): PositionKeyframe[] {
  return Array.from({ length: n }, (_, i) => pk((i * DURATION) / n, r() * 1000 - 500, r() * 600 - 300, { kind: i % 2 ? 'easeOut' : 'linear' }));
}

/** A video clip (0..DURATION s, source from 0) with position, scale, rotation, opacity and two colour params keyed. */
function animatedClip(id: string, n: number, seed: number): Clip {
  const r = rng(seed);
  return mk(id, {
    start: 0, in: 0, out: DURATION,
    keys: { position: positionKeys(n, r), scale: scalarKeys(n, r, 0.2, 3), rotation: scalarKeys(n, r, -720, 720), opacity: scalarKeys(n, r, 0, 1) },
    effects: [colourFx(`fx-${id}`, { keys: { brightness: scalarKeys(n, r, -1, 1), contrast: scalarKeys(n, r, -1, 1) } })],
  });
}

const clips = (n: number): Clip[] => Array.from({ length: CLIPS }, (_, i) => animatedClip(`c${i}`, n, 1000 + i));

let sink = 0;

/** Per-frame milliseconds of `frame(t)` over `frames` frames, best of `batches` batches (the least disturbed). */
function bestPerFrame(frame: (t: number) => void, frames = 400, batches = 9): number {
  let best = Infinity;
  for (let b = 0; b < batches; b++) {
    const t0 = performance.now();
    for (let i = 0; i < frames; i++) frame(((i * 7919) % (DURATION * FPS)) / FPS + 0.004);
    best = Math.min(best, (performance.now() - t0) / frames);
  }
  return best;
}

/** The resolver's work for one frame: every clip resolved once (what collectDraws does). */
const resolveFrame = (list: Clip[]) => (t: number): void => {
  for (const c of list) {
    const r = resolveClip(c, t, FPS);
    sink += r.transform.x + r.effects[0].params.brightness;
  }
};

/**
 * The reference loop: the same per-frame shape done by hand (a binary search and a linear blend per property, one
 * small object per property): what any evaluator must at least do. It measures this machine's speed right now.
 */
const referenceFrame = (list: Clip[]) => {
  const lists = list.map((c) => [c.keys!.scale!, c.keys!.rotation!, c.keys!.opacity!, c.effects[0].keys!.brightness, c.effects[0].keys!.contrast]);
  const pos = list.map((c) => c.keys!.position!);
  return (t: number): void => {
    const u = Math.floor(t * FPS + 1e-6) / FPS;
    for (let c = 0; c < lists.length; c++) {
      const out: Record<string, number> = {};
      const ls = [...lists[c], pos[c]];
      for (let j = 0; j < ls.length; j++) {
        const keys = ls[j] as { t: number; v?: number; x?: number }[];
        let lo = 0;
        let hi = keys.length - 1;
        while (lo < hi) {
          const mid = (lo + hi + 1) >> 1;
          if (keys[mid].t <= u) lo = mid;
          else hi = mid - 1;
        }
        const a = keys[lo];
        const b = keys[Math.min(lo + 1, keys.length - 1)];
        const f = b === a ? 0 : (u - a.t) / (b.t - a.t);
        const va = a.v ?? a.x!;
        out[`p${j}`] = va + ((b.v ?? b.x!) - va) * f;
      }
      sink += out.p0;
    }
  };
};

describe('keyframe evaluation cost (16 clips × 6 properties)', () => {
  it('500 keys per property: within budget, relative to a reference loop, and growing like log(keys)', () => {
    const big = clips(500);
    const small = clips(5);
    // Warm up the JIT on both paths before measuring.
    bestPerFrame(resolveFrame(big), 200, 2);
    bestPerFrame(resolveFrame(small), 200, 2);
    bestPerFrame(referenceFrame(big), 200, 2);
    const ms500 = bestPerFrame(resolveFrame(big));
    const ms5 = bestPerFrame(resolveFrame(small));
    const ref = bestPerFrame(referenceFrame(big));
    console.log(
      `resolveClip, 16 clips x 6 properties per frame: 500 keys ${(ms500 * 1000).toFixed(1)} µs, 5 keys ${(ms5 * 1000).toFixed(1)} µs ` +
        `(x${(ms500 / ms5).toFixed(2)}); reference loop ${(ref * 1000).toFixed(1)} µs (resolver x${(ms500 / ref).toFixed(2)}) [sink ${sink > 0 ? '+' : '-'}]`,
    );
    // Ruling T11-1: the plan's 0.2 ms per frame, on the best of 9 batches (a transiently loaded machine still has a
    // quiet batch); measured 33 µs, ~6x below it.
    expect(ms500).toBeLessThan(0.2);
    // Relative to the hand-written loop on the same machine at the same moment (load cancels out): measured x1.7;
    // a linear-scan evaluator measured x7.6.
    expect(ms500 / ref).toBeLessThan(5);
    // Binary search: 100x the keys cost little more (measured x1.7; a linear scan measured x7.7).
    expect(ms500 / ms5).toBeLessThan(4);
  });

  it('a static clip resolves to itself without work', () => {
    const still = mk('s', { start: 0, in: 0, out: DURATION, effects: [colourFx('f')] });
    expect(resolveClip(still, 3, FPS)).toBe(still);
  });
});

/** Bytes of the saved project (JSON is what IndexedDB's structured clone stores, field for field). */
const bytes = (p: Project): number => new TextEncoder().encode(JSON.stringify(p)).length;

/** The fixture project with `n` scalar keys on scale and `n` position keys on clip 'c', times on 30 fps frames. */
function keyed(n: number, which: 'scale' | 'position'): Project {
  const r = rng(7);
  const ts = Array.from({ length: n }, (_, i) => (i + 1) / FPS);
  const keys = which === 'scale'
    ? { scale: ts.map((t) => k(t, Math.round((0.5 + r() * 2) * 1000) / 1000)) }
    : { position: ts.map((t) => pk(t, Math.round(r() * 1920 - 960), Math.round(r() * 1080 - 540))) };
  return project({ keys: n > 0 ? keys : undefined });
}

describe('autosave size', () => {
  for (const which of ['scale', 'position'] as const) {
    it(`grows linearly with ${which} keys (≈ 60 bytes per key)`, () => {
      const sizes = [0, 100, 200, 300, 400, 500].map((n) => bytes(keyed(n, which)));
      const steps = sizes.slice(1).map((s, i) => (s - sizes[i]) / 100);
      const perKey = (sizes[5] - sizes[0]) / 500;
      console.log(`autosave: ${which} keys ${perKey.toFixed(1)} bytes per key (per-100 steps ${steps.map((s) => s.toFixed(1)).join(', ')}); 500 keys = ${((sizes[5] - sizes[0]) / 1024).toFixed(1)} KiB`);
      for (const s of steps) expect(Math.abs(s - perKey)).toBeLessThan(perKey * 0.05);
      expect(perKey).toBeGreaterThan(40);
      expect(perKey).toBeLessThan(90);
    });
  }
});
