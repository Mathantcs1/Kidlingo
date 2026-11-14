// Plan 5B Task 5 (P5B-6): a LONE in or out slot is never scaled to the clip, so a whole-frame split leaves every frame
// a half KEEPS identical to the original's (D12). Scaling a lone entrance into a shorter left half (or a lone exit into
// a shorter right half) would change those frames.
import { describe, expect, it } from 'vitest';
import { resolveClip } from '../src/core/animate';
import { clipEnd } from '../src/core/model';
import { motionWindows } from '../src/core/motion';
import type { PresetUse } from '../src/core/motionTypes';
import { splitClip } from '../src/core/timeline';
import { mk, rng } from './keyframe-fixtures';
import { FMT, FPS, frames, same, withClip } from './motion-split-fixtures';

const PRESETS_IN = ['fade', 'slide', 'zoom', 'spin'] as const;
const use = (preset: string, d: number, delay: number): PresetUse => ({ preset, duration: d, delay, ease: { kind: 'easeInOut' }, params: {} }) as PresetUse;

describe('lone in/out slot and split exactness (P5B-6)', () => {
  it('property: every frame each half keeps equals the original (300 clips, cuts inside the slot window included)', () => {
    const r = rng(77);
    let insideCut = 0;
    for (let i = 0; i < 300; i++) {
      const isIn = r() < 0.5;
      const preset = PRESETS_IN[Math.floor(r() * PRESETS_IN.length)];
      const u = use(preset, 0.3 + Math.round(r() * 80) / 100, Math.round(r() * 30) / 100);
      const dur = 2 + Math.round(r() * 150) / 100;
      const c = mk('c', { start: 10, in: 1, out: 1 + dur, motion: isIn ? { in: u } : { out: u } });
      const w = motionWindows(c);
      const n = 3 + Math.floor(r() * (Math.round(dur * FPS) - 6));
      const cut = 10 + n / FPS;
      const [left, right] = splitClip(withClip(c), 'c', cut).tracks[0].clips;
      const orig = (t: number) => resolveClip(c, t, FMT);
      if (isIn) {
        if (n / FPS < w.in!.end) insideCut++;
        for (const f of frames(0, n / FPS)) same(resolveClip(left, 10 + f, FMT), orig(10 + f), `#${i} left ${f}`);
        for (const f of frames(0, clipEnd(c) - cut)) if (n / FPS + f >= w.in!.end) same(resolveClip(right, cut + f, FMT), orig(cut + f), `#${i} right ${f}`);
      } else {
        if (n / FPS > w.out!.start) insideCut++;
        for (const f of frames(0, clipEnd(c) - cut)) same(resolveClip(right, cut + f, FMT), orig(cut + f), `#${i} right ${f}`);
        for (const f of frames(0, n / FPS)) if (f < w.out!.start) same(resolveClip(left, 10 + f, FMT), orig(10 + f), `#${i} left ${f}`);
      }
    }
    expect(insideCut).toBeGreaterThan(60); // the interesting case: the cut falls inside the entrance / exit window
  });
});
