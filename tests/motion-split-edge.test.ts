// Plan 5B Task 5 fix round 1 (I1): an emphasis set at the playhead and split at that same playhead starts exactly at
// the cut. Its `at` (frame-snapped local time) and the cut's local time differ by ~1e-15, so a plain `at < mid` gave it
// to the left half, whose range ends there: it never played. The emphasis goes to the half its window STARTS in, read
// with the 1e-9 edge tolerance; the right half's frames then equal the original's.
import { describe, expect, it } from 'vitest';
import { resolveClip } from '../src/core/animate';
import { clipEnd } from '../src/core/model';
import type { Clip } from '../src/core/model';
import { motionAt } from '../src/core/motion';
import { setPreset } from '../src/core/motionEdits';
import { splitClip, trimClip } from '../src/core/timeline';
import { clipOf, mk, rng } from './keyframe-fixtures';
import { FMT, FPS, frames, randomCase, same, withClip } from './motion-split-fixtures';

/** Clip 'o' with a Pulse emphasis set with the playhead at `at`, split there. */
function pulseSplitAt(clip: Clip, at: number): { orig: Clip; left: Clip; right: Clip } {
  const p = setPreset(withClip(clip), clip.id, 'emphasis', 'pulse', at);
  const [left, right] = splitClip(p, clip.id, at).tracks[0].clips;
  return { orig: clipOf(p, clip.id), left, right };
}

function expectRightKeeps(orig: Clip, left: Clip, right: Clip, cut: number): void {
  expect(left.motion?.emphasis).toBeUndefined();
  expect(right.motion?.emphasis).toBeDefined();
  for (const f of frames(0, clipEnd(orig) - cut)) same(resolveClip(right, cut + f, FMT), resolveClip(orig, cut + f, FMT), `right ${f}`);
  for (const f of frames(0, cut - orig.start)) same(resolveClip(left, orig.start + f, FMT), resolveClip(orig, orig.start + f, FMT), `left ${f}`);
}

describe('an emphasis starting exactly at the cut (I1)', () => {
  const overlay = mk('o', { kind: 'overlay', mediaId: '', start: 20, in: 0, out: 4 });

  for (const at of [20.1, 21.3]) {
    it(`sourceless, emphasis set at ${at} and split at ${at}: the right half keeps it, frame-exact`, () => {
      const { orig, left, right } = pulseSplitAt(overlay, at);
      expectRightKeeps(orig, left, right, at);
      expect(resolveClip(orig, at + 0.3, FMT).transform.scale).toBeCloseTo(1.15, 9);
      expect(resolveClip(right, at + 0.3, FMT).transform.scale).toBeCloseTo(1.15, 9);
    });
  }

  it('sourced clip with an off-grid start (10.013, in 0.5) split at its emphasis start 10.313', () => {
    const v = mk('c', { start: 10.013, in: 0.5, out: 4.5 });
    const { orig, left, right } = pulseSplitAt(v, 10.313);
    expect(orig.motion!.emphasis!.at).toBe(0.8);
    expectRightKeeps(orig, left, right, 10.313);
    expect(resolveClip(right, 10.613, FMT).transform.scale).toBeCloseTo(1.15, 9);
  });

  it('an emphasis starting one frame before the cut stays on the left half', () => {
    const p = setPreset(withClip(overlay), 'o', 'emphasis', 'pulse', 20.1 - 1 / FPS);
    const [left, right] = splitClip(p, 'o', 20.1).tracks[0].clips;
    expect(left.motion?.emphasis).toBeDefined();
    expect(right.motion?.emphasis).toBeUndefined();
  });

  it('the emphasis window reads its start with the edge tolerance: an `at` a hair after a frame starts on that frame', () => {
    const e = { preset: 'shake', duration: 0.5, delay: 0, ease: { kind: 'linear' }, params: { intensity: 0.05, frequency: 8, seed: 1 } } as const;
    const exact = mk('o', { kind: 'overlay', mediaId: '', start: 20, in: 0, out: 4, motion: { emphasis: { ...e, at: 0.1 } } });
    const hair = { ...exact, motion: { emphasis: { ...e, at: 0.1 + 1e-14 } } };
    expect(motionAt(hair, 20.1, FMT)).not.toBeNull();
    expect(motionAt(hair, 20.6, FMT)).toBeNull(); // its end (0.6 + 1e-14) is the frame at 0.6: off, as for `exact`
    for (const f of frames(0, 1)) same(resolveClip(hair, 20 + f, FMT), resolveClip(exact, 20 + f, FMT), `${f}`);
  });

  it('a sourceless start trim to the emphasis start keeps it starting on the new first frame', () => {
    const { orig } = pulseSplitAt(overlay, 21.3);
    const t = clipOf(trimClip(withClip(orig), 'o', 'start', 21.3), 'o');
    expect(motionAt(t, 21.3, FMT)).not.toBeNull();
    for (const f of frames(0, 1)) same(resolveClip(t, 21.3 + f, FMT), resolveClip(orig, 21.3 + f, FMT), `${f}`);
  });

  it('property: frame-aligned `at` values (as the playhead stores them), half the cuts exactly at the emphasis start', () => {
    const r = rng(77);
    let atCut = 0;
    for (let i = 0; i < 200; i++) {
      const { clip, n } = randomCase(r, true);
      const cut = clip.start + n / FPS;
      const [left, right] = splitClip(withClip(clip), 'c', cut).tracks[0].clips;
      const local = (clip.kind === 'overlay' || clip.kind === 'adjustment' ? 0 : clip.in) + n / FPS;
      if (Math.abs(clip.motion!.emphasis!.at - local) < 1e-9) atCut++;
      for (const f of frames(0, n / FPS)) same(resolveClip(left, clip.start + f, FMT), resolveClip(clip, clip.start + f, FMT), `#${i} left ${f}`);
      for (const f of frames(0, clipEnd(clip) - cut)) same(resolveClip(right, cut + f, FMT), resolveClip(clip, cut + f, FMT), `#${i} right ${f}`);
    }
    expect(atCut).toBeGreaterThan(30);
  });
});
