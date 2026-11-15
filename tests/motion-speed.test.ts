// Plan 5D Task 5 (O3): In/Out presets run in TIMELINE seconds (unchanged by speed); emphasis and loop are anchored on FOOTAGE.
import { describe, expect, it } from 'vitest';
import { clipDuration, sourceAtOffset } from '../src/core/clipTime';
import { motionAt, motionWindows } from '../src/core/motion';
import type { Clip } from '../src/core/model';
import type { ClipMotion, EmphasisUse, PresetKey, PresetUse } from '../src/core/motionTypes';
import { presetParams } from '../src/core/presets';
import { mk } from './keyframe-fixtures';

const FMT = { width: 1920, height: 1080, fps: 30 };
const lin = { kind: 'linear' } as const;
const use = (preset: PresetKey, slot: 'in' | 'out' | 'emphasis', over: Partial<PresetUse> = {}): PresetUse =>
  ({ preset, duration: 1, delay: 0, ease: { ...lin }, params: presetParams(preset, slot), ...over });
const emph = (at: number, duration: number): EmphasisUse => ({ ...use('pulse', 'emphasis', { duration }), at });
// video clip start 10, in 2, out 8 (6 s of footage)
const clip = (motion: ClipMotion, over: Partial<Clip> = {}): Clip => mk('c', { motion, in: 2, out: 8, ...over });

describe('In and Out windows are timeline seconds', () => {
  it('the In window is the first timeline second at 1x, 2x and in reverse; the Out window ends at the clip end', () => {
    for (const extra of [{}, { speed: 2 }, { reverse: true }, { speed: 0.5 }] as Partial<Clip>[]) {
      const c = clip({ in: use('fade', 'in'), out: use('fade', 'out') }, extra);
      const w = motionWindows(c);
      expect(w.in!.start).toBeCloseTo(0, 9);
      expect(w.in!.end - w.in!.start).toBeCloseTo(1, 9);
      expect(w.out!.end).toBeCloseTo(clipDuration(c), 9);
    }
  });
  it('the In preset at 0.5 s into the clip looks the same at 1x and 2x (same timeline progress)', () => {
    const a = motionAt(clip({ in: use('fade', 'in') }), 10.5, FMT);
    const b = motionAt(clip({ in: use('fade', 'in') }, { speed: 2 }), 10.5, FMT);
    expect(b!.kOpacity).toBeCloseTo(a!.kOpacity, 9);
  });
});

describe('emphasis follows the footage', () => {
  it('at 2x the emphasis [at, at+1] footage lasts half a timeline second; outside it nothing is drawn', () => {
    const c = clip({ emphasis: emph(4, 1) }, { speed: 2 });
    const at = (u: number): number => 10 + (u - 2) / 2; // timeline time showing footage u
    expect(motionAt(c, at(4.5), FMT)).not.toBeNull();
    expect(motionAt(c, at(3.5), FMT)).toBeNull();
    expect(motionAt(c, at(5.5), FMT)).toBeNull();
  });
  it('in reverse the same footage window is hit in the opposite timeline order', () => {
    const c = clip({ emphasis: emph(4, 1) }, { reverse: true });
    const at = (u: number): number => 10 + (8 - u); // footage u shows at offset out-u
    expect(motionAt(c, at(4.5), FMT)).not.toBeNull();
    expect(motionAt(c, at(3.5), FMT)).toBeNull();
    expect(motionAt(c, at(5.5), FMT)).toBeNull();
    expect(sourceAtOffset(c, 3.5)).toBeCloseTo(4.5, 9);
  });
});
