// Plan 5B Task 6 (Ruling P5B-3): the overlay texture bound covers keys, offset key loops and the preset stack, and is
// capped; without loops and presets it is exactly the 5A `maxScale` (5A textures unchanged).
import { describe, it, expect } from 'vitest';
import { MAX_DRAWN_SCALE, maxDrawnScale } from '../src/core/drawnScale';
import { maxScale } from '../src/core/keyframes';
import { maxMotionScale } from '../src/core/motion';
import { resolveClip } from '../src/core/animate';
import { defaultClipAudio } from '../src/core/model';
import type { Clip, Keyframe, KeyLoop } from '../src/core/model';
import { presetEase, presetParams } from '../src/core/presets';
import type { PresetKey } from '../src/core/motionTypes';

const lin = { kind: 'linear' as const };
const k = (t: number, v: number, ease = lin as Keyframe['ease']): Keyframe => ({ t, v, ease });
const FMT = { width: 320, height: 180, fps: 30 };

function clip(extra: Partial<Clip> = {}): Clip {
  return {
    id: 'c', mediaId: '', kind: 'overlay', start: 0, in: 0, out: 2, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    volume: 1, fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal', overlay: { type: 'sticker' } as Clip['overlay'], ...extra,
  };
}

const inUse = (preset: PresetKey) => ({ preset, duration: 0.5, delay: 0, ease: presetEase(preset, 'in'), params: presetParams(preset, 'in') });
const looped = (keys: Keyframe[], loop: KeyLoop): Partial<Clip> => ({ keys: { scale: keys, loops: { scale: loop } } });

/** The largest drawn scale over every frame of the clip (the bound must hold on each). */
function sampledMax(c: Clip): number {
  let m = 0;
  for (let f = 0; f <= 60; f++) m = Math.max(m, resolveClip(c, f / 30, FMT).transform.scale);
  return m;
}

describe('maxDrawnScale', () => {
  it('includes the overshoot of a spring-eased scale segment (above the key, below the cap) and still bounds every frame', () => {
    const bouncy = { kind: 'spring' as const, spring: { stiffness: 400, damping: 3, mass: 1 } };
    const c = clip({ keys: { scale: [k(0, 1, bouncy), k(1, 2)] } });
    const b = maxDrawnScale(c);
    expect(b).toBeGreaterThan(2);
    expect(b).toBeLessThan(MAX_DRAWN_SCALE);
    expect(sampledMax(c)).toBeGreaterThan(2);
    expect(b).toBeGreaterThanOrEqual(sampledMax(c) - 1e-9);
    // A non-spring ease keeps the 5A bound (textures unchanged).
    expect(maxDrawnScale(clip({ keys: { scale: [k(0, 1, { kind: 'easeOut' }), k(1, 2)] } }))).toBe(2);
  });

  it('is exactly maxScale for 5A clips (static, keyed, eased) and multiplies the preset bound', () => {
    const cases = [clip(), clip({ transform: { x: 0, y: 0, scale: 0.4, rotation: 0, opacity: 1 } }), clip({ keys: { scale: [k(0, 1, { kind: 'back' }), k(1, 3), k(2, 0.5)] } })];
    for (const c of cases) expect(maxDrawnScale(c)).toBe(maxScale(c));
    const pop = clip({ keys: { scale: [k(0, 1), k(1, 2)] }, motion: { in: inUse('pop') } });
    expect(maxDrawnScale(pop)).toBe(2 * maxMotionScale(pop));
    expect(maxDrawnScale(pop)).toBeCloseTo(2.3, 12);
  });

  it('repeat and ping-pong loops stay within the keys; an offset loop climbs by count (or the clip) × rise', () => {
    const keys = [k(0, 0.5), k(0.5, 1)];
    expect(maxDrawnScale(clip(looped(keys, { mode: 'repeat', count: null })))).toBe(1);
    expect(maxDrawnScale(clip(looped(keys, { mode: 'pingPong', count: 3 })))).toBe(1);
    expect(maxDrawnScale(clip(looped(keys, { mode: 'offset', count: 2 })))).toBe(2);
    // No count: cycles up to the clip end (2 s / 0.5 s = 4 cycles) => 1 + 4 × 0.5.
    expect(maxDrawnScale(clip(looped(keys, { mode: 'offset', count: null })))).toBe(3);
    // A falling offset loop never exceeds the keys.
    expect(maxDrawnScale(clip(looped([k(0, 2), k(0.5, 1)], { mode: 'offset', count: null })))).toBe(2);
    // Sourced clip: the local range is [in, out].
    const img = clip({ kind: 'image', mediaId: 'm', in: 1, out: 3, ...looped([k(1, 1), k(1.5, 1.5)], { mode: 'offset', count: null }) });
    expect(maxDrawnScale(img)).toBe(1.5 + 4 * 0.5);
  });

  it('bounds every frame of looped and preset clips', () => {
    const cs = [
      clip(looped([k(0, 0.5), k(0.3, 1)], { mode: 'offset', count: null })),
      clip({ ...looped([k(0, 0.5), k(0.7, 1.2, { kind: 'easeInOut' })], { mode: 'offset', count: 1 }), motion: { in: inUse('zoom') } }),
      clip({ motion: { in: inUse('pop') } }),
    ];
    for (const c of cs) expect(sampledMax(c)).toBeLessThanOrEqual(maxDrawnScale(c) + 1e-9);
  });

  it('is capped: a sub-frame offset period and a huge/NaN bound read as MAX_DRAWN_SCALE (finite)', () => {
    const tiny = clip(looped([k(0, 1), k(1e-6, 2)], { mode: 'offset', count: null }));
    expect(maxDrawnScale(tiny)).toBe(MAX_DRAWN_SCALE);
    expect(Number.isFinite(MAX_DRAWN_SCALE)).toBe(true);
    expect(maxDrawnScale(clip({ transform: { x: 0, y: 0, scale: NaN, rotation: 0, opacity: 1 } }))).toBe(MAX_DRAWN_SCALE);
    expect(maxDrawnScale(clip({ keys: { scale: [k(0, 1), k(1, Infinity)] } }))).toBe(MAX_DRAWN_SCALE);
  });
});
