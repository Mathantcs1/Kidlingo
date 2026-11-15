import { describe, it, expect } from 'vitest';
import { FX_TYPES } from '../src/core/model';
import { FX_SCHEMAS, MAX_FX_PER_CLIP, clampFxParams, defaultFxParams } from '../src/fx/params';

describe('FX_SCHEMAS', () => {
  it('has a schema for every effect type, with unique keys and defaults inside their ranges', () => {
    expect(Object.keys(FX_SCHEMAS).sort()).toEqual([...FX_TYPES].sort());
    for (const type of FX_TYPES) {
      const s = FX_SCHEMAS[type];
      expect(s.type).toBe(type);
      const keys = s.params.map((p) => p.key);
      expect(new Set(keys).size, type).toBe(keys.length);
      for (const p of s.params) {
        expect(p.def, `${type}.${p.key}`).toBeGreaterThanOrEqual(p.min);
        expect(p.def, `${type}.${p.key}`).toBeLessThanOrEqual(p.max);
      }
    }
  });

  it('marks exactly grain, glitch and vhs as time driven, and lut as needing a library entry', () => {
    expect(FX_TYPES.filter((t) => FX_SCHEMAS[t].timeDriven).sort()).toEqual(['glitch', 'grain', 'vhs']);
    expect(FX_TYPES.filter((t) => FX_SCHEMAS[t].needsLut)).toEqual(['lut']);
  });

  it('limits a clip to 12 effects', () => expect(MAX_FX_PER_CLIP).toBe(12));
});

describe('clampFxParams / defaultFxParams', () => {
  it('defaults hold every schema key at its default', () => {
    for (const type of FX_TYPES) {
      const d = defaultFxParams(type);
      expect(Object.keys(d).sort()).toEqual(FX_SCHEMAS[type].params.map((p) => p.key).sort());
      expect(clampFxParams(type, d)).toEqual(d);
    }
  });

  it('clamps out-of-range values, replaces non-finite ones with the default, fills missing keys and drops unknown ones', () => {
    expect(clampFxParams('color', { exposure: 99, brightness: -99, contrast: NaN, bogus: 1 })).toEqual({
      ...defaultFxParams('color'), exposure: 3, brightness: -1,
    });
    expect(clampFxParams('blur', { radius: Infinity })).toEqual({ radius: 8 });
    expect(clampFxParams('blur', { radius: 500 })).toEqual({ radius: 100 });
    expect(clampFxParams('grain', {})).toEqual(defaultFxParams('grain'));
  });

  it('rounds select, bool and colour values to integers', () => {
    expect(clampFxParams('mirror', { mode: 2.6 }).mode).toBe(3);
    expect(clampFxParams('mirror', { mode: 99 }).mode).toBe(4);
    expect(clampFxParams('look', { preset: -3 }).preset).toBe(0);
    expect(clampFxParams('chroma', { key: 0x12ab34 + 0.4 }).key).toBe(0x12ab34);
    expect(clampFxParams('chroma', { key: 0xffffffff }).key).toBe(0xffffff);
  });

  it('does not mutate its input', () => {
    const input = { radius: 500 };
    clampFxParams('blur', input);
    expect(input).toEqual({ radius: 500 });
  });
});
