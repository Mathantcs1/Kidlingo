// Plan 5B Task 7 (ruling T7-1): choosing another preset for a filled slot keeps where it sits in time (in/out delay,
// emphasis `at`, loop phase and count) and a compatible direction; every other setting resets to the new preset's
// defaults. One project (one apply); the same reference for a repeat; refusals as setPreset.
import { describe, expect, it } from 'vitest';
import { setPreset, setPresetParams } from '../src/core/motionEdits';
import { swapPreset } from '../src/core/presetSwap';
import { PRESETS } from '../src/core/presets';
import type { Project } from '../src/core/model';
import { clipOf, project } from './keyframe-fixtures';

const m = (p: Project, id = 'c') => clipOf(p, id).motion!;

describe('swapPreset', () => {
  it('an empty slot gets the preset defaults (= setPreset)', () => {
    expect(swapPreset(project(), 'c', 'in', 'fade', 11)).toEqual(setPreset(project(), 'c', 'in', 'fade', 11));
    expect(swapPreset(project(), 'c', 'emphasis', 'pulse', 11.5)).toEqual(setPreset(project(), 'c', 'emphasis', 'pulse', 11.5));
  });

  it('keeps the delay and a compatible direction, resets duration, ease and other params', () => {
    let p = setPreset(project(), 'c', 'in', 'slide', 11);
    p = setPresetParams(p, 'c', 'in', { delay: 0.3, duration: 1.5, params: { direction: 2, distance: 0.4 } });
    const q = swapPreset(p, 'c', 'in', 'whip', 11);
    expect(m(q).in).toEqual({ ...m(setPreset(project(), 'c', 'in', 'whip', 11)).in!, delay: 0.3, params: { direction: 2, distance: PRESETS.whip.params[1].def } });
    // No direction on Fade: only the delay is kept.
    expect(m(swapPreset(p, 'c', 'in', 'fade', 11)).in).toEqual({ preset: 'fade', duration: 0.5, delay: 0.3, ease: { kind: 'easeOut' }, params: {} });
  });

  it('a direction outside the new preset range resets (Ken Burns diagonals are not Slide directions)', () => {
    let p = setPreset(project(), 'c', 'loop', 'kenBurns', 11);
    p = setPresetParams(p, 'c', 'loop', { params: { direction: 6 } });
    const q = swapPreset(p, 'c', 'loop', 'float', 11);
    expect(m(q).loop!.preset).toBe('float');
    let s = setPreset(project(), 'c', 'in', 'whip', 11);
    s = setPresetParams(s, 'c', 'in', { params: { direction: 3 } });
    expect(m(swapPreset(s, 'c', 'in', 'slide', 11)).in!.params.direction).toBe(3);
  });

  it('emphasis keeps its `at` (not the playhead); loop keeps phase and count', () => {
    let p = setPreset(project(), 'c', 'emphasis', 'pulse', 11.5);
    const q = swapPreset(p, 'c', 'emphasis', 'hop', 13);
    expect(m(q).emphasis!.at).toBe(3.5);
    expect(m(q).emphasis!.preset).toBe('hop');
    p = setPreset(project(), 'c', 'loop', 'breathe', 11);
    p = setPresetParams(p, 'c', 'loop', { phase: 0.7, count: 3 });
    const l = m(swapPreset(p, 'c', 'loop', 'spinLoop', 11)).loop!;
    expect([l.preset, l.phase, l.count, l.duration]).toEqual(['spinLoop', 0.7, 3, PRESETS.spinLoop.defaultDuration]);
  });

  it('the same preset again is the same reference; input is never mutated; refusals as setPreset', () => {
    const p = setPreset(project(), 'c', 'in', 'slide', 11);
    const json = JSON.stringify(p);
    expect(swapPreset(p, 'c', 'in', 'slide', 11)).toBe(p);
    swapPreset(p, 'c', 'in', 'zoom', 11);
    expect(JSON.stringify(p)).toBe(json);
    expect(() => swapPreset(p, 'adj', 'in', 'slide', 31)).toThrow('Adjustment layers only fade');
    expect(() => swapPreset(p, 'lc', 'in', 'fade', 11)).toThrow(/locked/i);
    expect(() => swapPreset(p, 'ac', 'in', 'fade', 11)).toThrow('Audio clips have no animation presets');
  });
});
