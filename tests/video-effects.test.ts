import { describe, it, expect } from 'vitest';
import { MAX_VIDEO_EFFECTS, VIDEO_EFFECTS, clampParams, defaultParams } from '../src/core/videoEffects';
import type { VideoEffectType } from '../src/core/model';

const TYPES = Object.keys(VIDEO_EFFECTS) as VideoEffectType[];

describe('VIDEO_EFFECTS schema', () => {
  it('registers the 17 effect types, none available yet, with unique param keys', () => {
    expect(TYPES.sort()).toEqual([
      'blur', 'bw', 'chromaKey', 'colour', 'glitch', 'glow', 'grain', 'invert', 'lut', 'mirror', 'pixelate',
      'rgbSplit', 'sepia', 'sharpen', 'splitTone', 'vhs', 'vignette',
    ]);
    expect(MAX_VIDEO_EFFECTS).toBe(8);
    for (const t of TYPES) {
      const s = VIDEO_EFFECTS[t];
      expect(s.type).toBe(t);
      expect(s.available).toBe(false);
      expect(new Set(s.params.map((d) => d.key)).size).toBe(s.params.length);
      for (const d of s.params) {
        expect(d.min).toBeLessThan(d.max);
        expect(d.def).toBeGreaterThanOrEqual(d.min);
        expect(d.def).toBeLessThanOrEqual(d.max);
      }
    }
  });

  it('fixes the planned params, groups and time-based flags', () => {
    expect(VIDEO_EFFECTS.colour.params.map((d) => [d.key, d.min, d.max, d.def])).toEqual([
      ['brightness', -1, 1, 0], ['contrast', -1, 1, 0], ['saturation', -1, 1, 0], ['exposure', -2, 2, 0],
      ['temperature', -1, 1, 0], ['tint', -1, 1, 0], ['hue', -180, 180, 0], ['shadows', -1, 1, 0], ['highlights', -1, 1, 0],
    ]);
    expect(VIDEO_EFFECTS.chromaKey.params.map((d) => [d.key, d.def])).toEqual([
      ['keyR', 0], ['keyG', 1], ['keyB', 0], ['similarity', 0.35], ['smoothness', 0.1], ['spill', 0.5],
    ]);
    expect(VIDEO_EFFECTS.lut.params.map((d) => [d.key, d.def])).toEqual([['intensity', 1]]);
    expect(VIDEO_EFFECTS.mirror.params[0]).toMatchObject({ key: 'mode', min: 0, max: 3, def: 0 });
    expect(VIDEO_EFFECTS.glow.params.map((d) => d.key)).toEqual(['threshold', 'radius', 'intensity']);
    expect(TYPES.filter((t) => VIDEO_EFFECTS[t].timeBased).sort()).toEqual(['glitch', 'grain', 'vhs']);
    expect(VIDEO_EFFECTS.colour.group).toBe('colour');
    expect(VIDEO_EFFECTS.blur.group).toBe('blur');
    expect(VIDEO_EFFECTS.chromaKey.group).toBe('key');
    expect(VIDEO_EFFECTS.glitch.group).toBe('stylise');
    expect(VIDEO_EFFECTS.vignette.group).toBe('look');
  });
});

describe('defaultParams / clampParams', () => {
  it.each(TYPES)('%s: defaults are in range and clamping defaults is the identity', (t) => {
    const d = defaultParams(t);
    expect(Object.keys(d)).toEqual(VIDEO_EFFECTS[t].params.map((x) => x.key));
    expect(clampParams(t, d)).toEqual(d);
  });

  it.each(TYPES)('%s: NaN, out-of-range, unknown and missing keys are repaired', (t) => {
    const defs = VIDEO_EFFECTS[t].params;
    const first = defs[0];
    const out = clampParams(t, { [first.key]: Number.NaN, bogus: 5 });
    expect(out[first.key]).toBe(first.def);
    expect('bogus' in out).toBe(false);
    expect(Object.keys(out)).toEqual(defs.map((x) => x.key));
    expect(clampParams(t, { [first.key]: 1e9 })[first.key]).toBe(first.max);
    expect(clampParams(t, { [first.key]: -1e9 })[first.key]).toBe(first.min);
    expect(clampParams(t, { [first.key]: Infinity })[first.key]).toBe(first.def);
    expect(clampParams(t, {})).toEqual(defaultParams(t));
  });
});
