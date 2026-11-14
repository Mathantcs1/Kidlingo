// Plan 5B Task 5: the preset library and every preset's maths (presetMath.ts): exact rest/start/end states, params at
// their limits and opacity-only presets. Ken Burns, Shake/Jitter and the scale bound: presets-shapes.test.ts.
import { describe, expect, it } from 'vitest';
import { easeAt } from '../src/core/easing';
import type { MotionOffsets, MotionSlot, PresetKey } from '../src/core/motionTypes';
import { WHIP_TILT, presetMaxScale, presetOffsets } from '../src/core/presetMath';
import { PRESETS, PRESET_KEYS, PRESET_SCHEMA, presetEase, presetLabel, presetParams, presetsForSlot } from '../src/core/presets';
import { rng } from './keyframe-fixtures';
import { EASES, F, H, ID, W, entries, finite, randomEase, randomParams, restP } from './preset-fixtures';

describe('the library (Q1)', () => {
  it('has 20 definitions giving 28 entries: 8 entrances, 8 exits, 6 emphases, 6 loops', () => {
    expect(PRESET_KEYS).toHaveLength(20);
    expect(presetsForSlot('in')).toEqual(['fade', 'slide', 'zoom', 'pop', 'spin', 'drop', 'whip', 'rise']);
    expect(presetsForSlot('out')).toEqual(presetsForSlot('in'));
    expect(presetsForSlot('emphasis')).toEqual(['pulse', 'shake', 'wobble', 'flash', 'hop', 'spin360']);
    expect(presetsForSlot('loop')).toEqual(['breathe', 'float', 'spinLoop', 'jitter', 'blink', 'kenBurns']);
  });

  it('labels per slot (Rise / Sink), synonyms, and the schema is the single source of the defaults', () => {
    expect(presetLabel('rise', 'in')).toBe('Rise');
    expect(presetLabel('rise', 'out')).toBe('Sink');
    expect(presetLabel('spin360', 'emphasis')).toBe('Spin 360');
    expect(presetLabel('kenBurns', 'loop')).toBe('Ken Burns');
    for (const k of PRESET_KEYS) {
      const d = PRESETS[k];
      expect(d.label.length).toBeGreaterThan(0);
      expect(d.synonyms.every((s) => s === s.toLowerCase())).toBe(true);
      expect(d.defaultDuration).toBe(PRESET_SCHEMA[k].duration);
      expect(d.defaultEase).toBe(PRESET_SCHEMA[k].ease);
      expect(d.params).toBe(PRESET_SCHEMA[k].params);
    }
  });

  it('exit defaults: Zoom Out grows to 1.5, eases mirror the entrance (easeOut => easeIn, back => back-in)', () => {
    expect(presetParams('zoom', 'in')).toEqual({ from: 0.5 });
    expect(presetParams('zoom', 'out')).toEqual({ from: 1.5 });
    expect(presetEase('slide', 'in')).toEqual({ kind: 'easeOut' });
    expect(presetEase('slide', 'out')).toEqual({ kind: 'easeIn' });
    expect(presetEase('whip', 'out')).toEqual({ kind: 'bezier', bezier: [0.36, 0, 0.66, -0.56] });
    expect(presetEase('pop', 'out')).toEqual({ kind: 'spring', spring: { stiffness: 170, damping: 26, mass: 1 } });
    const a = presetEase('pop', 'in');
    a.spring!.damping = 1;
    expect(presetEase('pop', 'in').spring!.damping).toBe(26);
  });

  it('opacity-only presets are fade, flash and blink (D13)', () => {
    expect(PRESET_KEYS.filter((k) => PRESETS[k].opacityOnly)).toEqual(['fade', 'flash', 'blink']);
  });
});

describe('rest, start and end states', () => {
  it('every preset is exactly the identity at rest, for every ease and random params', () => {
    const r = rng(11);
    for (const [key, slot] of entries()) {
      for (const ease of EASES) {
        const params = key === 'kenBurns' ? { ...randomParams(key, r), from: 1 } : randomParams(key, r);
        for (const p of restP(slot)) {
          expect(presetOffsets(key, slot, p, params, F, { ease }), `${key} ${slot} p=${p} ${ease.kind}`).toEqual(ID);
        }
      }
    }
  });

  it('entrances start at their start state at p = 0 (exact)', () => {
    const at0 = (k: PresetKey) => presetOffsets(k, 'in', 0, presetParams(k, 'in'), F, { ease: presetEase(k, 'in') });
    expect(at0('fade')).toEqual({ ...ID, kOpacity: 0 });
    expect(at0('slide')).toEqual({ ...ID, dx: -1 * W });
    expect(presetOffsets('slide', 'in', 0, { direction: 1, distance: 0.5 }, F)).toEqual({ ...ID, dx: 0.5 * W });
    expect(presetOffsets('slide', 'in', 0, { direction: 2, distance: 1 }, F)).toEqual({ ...ID, dy: -H });
    expect(presetOffsets('slide', 'in', 0, { direction: 3, distance: 2 }, F)).toEqual({ ...ID, dy: 2 * H });
    expect(at0('zoom')).toEqual({ ...ID, kScale: 0.5, kOpacity: 0 });
    expect(at0('pop')).toEqual({ ...ID, kScale: 0 });
    expect(at0('spin')).toEqual({ ...ID, drot: -180, kScale: 0.5 });
    expect(at0('drop')).toEqual({ ...ID, dy: -0.6 * H });
    expect(at0('whip')).toEqual({ ...ID, dx: -W, drot: WHIP_TILT });
    expect(at0('rise')).toEqual({ ...ID, dy: 0.1 * H, kOpacity: 0 });
  });

  it('exits end at their end state at p = 1 (exact): mirrored, Drop falls and Spin keeps turning', () => {
    const at1 = (k: PresetKey) => presetOffsets(k, 'out', 1, presetParams(k, 'out'), F, { ease: presetEase(k, 'out') });
    expect(at1('fade')).toEqual({ ...ID, kOpacity: 0 });
    expect(at1('slide')).toEqual({ ...ID, dx: -W });
    expect(at1('zoom')).toEqual({ ...ID, kScale: 1.5, kOpacity: 0 });
    expect(at1('pop')).toEqual({ ...ID, kScale: 0 });
    expect(at1('spin')).toEqual({ ...ID, drot: 180, kScale: 0.5 });
    expect(at1('drop')).toEqual({ ...ID, dy: 0.6 * H });
    expect(at1('whip')).toEqual({ ...ID, dx: -W, drot: WHIP_TILT });
    expect(at1('rise')).toEqual({ ...ID, dy: 0.1 * H, kOpacity: 0 });
  });

  it('Pop overshoots to exactly 1 + intensity on the way in and out', () => {
    for (const i of [0, 0.15, 0.5]) {
      let max = 0;
      for (let n = 0; n <= 4000; n++) max = Math.max(max, presetOffsets('pop', 'in', n / 4000, { intensity: i }, F).kScale);
      expect(max).toBeCloseTo(1 + i, 6);
      expect(presetMaxScale('pop', 'in', { intensity: i })).toBe(1 + i);
    }
  });

  it('emphases and loops are at rest at both ends of their window / cycle (Blink is off at the end of its cycle)', () => {
    for (const [key, slot] of entries().filter(([, s]) => s === 'emphasis' || s === 'loop')) {
      if (key === 'kenBurns' || key === 'blink') continue;
      const end = presetOffsets(key, slot, 1, presetParams(key, slot), F);
      for (const f of Object.keys(ID) as (keyof MotionOffsets)[]) expect(Math.abs(end[f] - ID[f]), `${key} ${f}`).toBeLessThan(1e-9);
    }
    expect(presetOffsets('blink', 'loop', 0.49, { duty: 0.5 }, F).kOpacity).toBe(1);
    expect(presetOffsets('blink', 'loop', 0.5, { duty: 0.5 }, F).kOpacity).toBe(0);
  });

  it('emphasis and loop shapes move in between', () => {
    const mid = (k: PresetKey, s: MotionSlot) => presetOffsets(k, s, 0.25, presetParams(k, s), F);
    expect(mid('pulse', 'emphasis').kScale).toBeCloseTo(1 + 0.15 * Math.sin(Math.PI * easeAt({ kind: 'linear' }, 0.25)), 12);
    expect(mid('hop', 'emphasis').dy).toBeLessThan(0);
    expect(mid('wobble', 'emphasis').drot).not.toBe(0);
    expect(presetOffsets('flash', 'emphasis', 0.25, { flashes: 2 }, F).kOpacity).toBe(0);
    expect(mid('spin360', 'emphasis').drot).toBe(90);
    expect(presetOffsets('spin360', 'emphasis', 0.75, { turns: 1 }, F).drot).toBe(-90);
    expect(mid('float', 'loop').dy).toBeCloseTo(-0.03 * H, 9);
    expect(mid('breathe', 'loop').kScale).toBeCloseTo(1.025, 12);
  });
});

describe('params and kinds', () => {
  it('params at their min and max (and NaN / Infinity / missing) stay finite with scale >= 0 and opacity >= 0', () => {
    for (const [key, slot] of entries()) {
      const variants: Record<string, number>[] = [{}, { x: Number.NaN }];
      for (const d of PRESET_SCHEMA[key].params) {
        for (const v of [d.min, d.max, Number.NaN, Infinity, -Infinity]) variants.push({ ...presetParams(key, slot), [d.key]: v });
      }
      for (const params of variants) {
        for (let n = 0; n <= 20; n++) {
          for (const ease of EASES) {
            const o = presetOffsets(key, slot, n / 20, params, F, { ease, seconds: 0.7 });
            expect(finite(o), `${key} ${slot} ${JSON.stringify(params)}`).toBe(true);
            expect(o.kScale).toBeGreaterThanOrEqual(0);
            expect(o.kOpacity).toBeGreaterThanOrEqual(0);
          }
        }
      }
    }
    expect(finite(presetOffsets('slide', 'in', Number.NaN, {}, F))).toBe(true);
    expect(presetOffsets('slide', 'in', Number.NaN, {}, F)).toEqual(presetOffsets('slide', 'in', 0, {}, F));
    expect(finite(presetOffsets('shake', 'emphasis', 0.5, {}, F, { seconds: Number.NaN }))).toBe(true);
  });

  it('opacity-only presets touch only the opacity factor; the others move something else', () => {
    const r = rng(5);
    for (const [key, slot] of entries()) {
      let other = false;
      for (let n = 0; n < 60; n++) {
        const o = presetOffsets(key, slot, r(), randomParams(key, r), F, { ease: randomEase(r), seconds: 0.5 + r() });
        const moves = o.dx !== 0 || o.dy !== 0 || o.drot !== 0 || o.kScale !== 1;
        if (PRESETS[key].opacityOnly) expect(moves, `${key} ${slot}`).toBe(false);
        other ||= moves;
      }
      if (!PRESETS[key].opacityOnly) expect(other, `${key} ${slot}`).toBe(true);
    }
  });
});
