// Plan 5 Task 7: store-bound commands behind the effect-parameter keyframe rows (one undo step each).
import { beforeEach, describe, expect, it } from 'vitest';
import type { AnimTarget } from '../src/core/keyframeEdits';
import type { Clip, Project } from '../src/core/model';
import { defaultParams } from '../src/core/videoEffects';
import { useEditor } from '../src/state/store';
import { toggleAnimatedCmd, toggleKeyAtPlayheadCmd } from '../src/ui/keyframeCommands';
import { useToasts } from '../src/ui/Toast';
import { KEY_TARGETS, applyLookCmd, removeVideoEffectCmd, setEffectParamCmd, setKeyColourCmd } from '../src/ui/videoEffectCommands';
import { base, video } from './overlay-fixtures';

const BRIGHT: AnimTarget = { kind: 'effect', effectId: 'fx', param: 'brightness' };
const key = (param: string): AnimTarget => ({ kind: 'effect', effectId: 'ck', param });
const lin = { kind: 'linear' } as const;
const fx = (id: string, type: 'colour' | 'chromaKey' | 'mirror') => ({ id, type, enabled: true, params: type === 'mirror' ? { mode: 0 } : defaultParams(type) });

const state = () => useEditor.getState();
const depth = () => state().history.past.length;
const present = () => state().history.present;
const clip = (): Clip => present().tracks.flatMap((t) => t.clips).find((c) => c.id === 'c1')!;
const effect = (id: string) => clip().effects.find((e) => e.id === id)!;
const toasts = () => useToasts.getState().toasts.map((t) => t.message);
const json = (p: Project) => JSON.stringify(p);

/** Clip c1 at 2..6 s (in 1), effects colour 'fx', chroma key 'ck', mirror 'mr'. */
function load(locked = false): void {
  const p = base();
  state().loadProject({
    ...p,
    tracks: p.tracks.map((t) => (t.id === 'v'
      ? { ...t, locked, clips: [video('c1', { start: 2, in: 1, out: 5, effects: [fx('fx', 'colour'), fx('ck', 'chromaKey'), fx('mr', 'mirror')] })] }
      : t)),
  });
}

beforeEach(() => {
  load();
  useToasts.setState({ toasts: [] });
});

describe('setEffectParamCmd', () => {
  it('static: the static edit, ONE step', () => {
    state().setPlayhead(3);
    setEffectParamCmd('c1', 'fx', 'brightness', 0.4);
    expect(depth()).toBe(1);
    expect(effect('fx').params.brightness).toBe(0.4);
    expect(effect('fx').keys).toBeUndefined();
  });

  it('animated: one key at the playhead per call, the stored value untouched', () => {
    state().setPlayhead(3);
    toggleAnimatedCmd('c1', BRIGHT);
    state().setPlayhead(4);
    setEffectParamCmd('c1', 'fx', 'brightness', 0.5);
    expect(depth()).toBe(2);
    expect(effect('fx').keys!.brightness).toEqual([{ t: 2, v: 0, ease: lin }, { t: 3, v: 0.5, ease: lin }]);
    expect(effect('fx').params.brightness).toBe(0);
  });

  it('animated off the clip: toast, no step', () => {
    state().setPlayhead(3);
    toggleAnimatedCmd('c1', BRIGHT);
    state().setPlayhead(0);
    setEffectParamCmd('c1', 'fx', 'brightness', 0.5);
    expect(depth()).toBe(1);
    expect(toasts().join()).toMatch(/playhead onto the clip/);
  });

  it('mirror.mode is not animatable: it uses the static edit', () => {
    setEffectParamCmd('c1', 'mr', 'mode', 2);
    expect(depth()).toBe(1);
    expect(effect('mr').params.mode).toBe(2);
  });
});

describe('the chroma key colour', () => {
  it('static: keyR/G/B change statically in ONE step', () => {
    state().setPlayhead(3);
    setKeyColourCmd('c1', 'ck', '#ff8000');
    expect(depth()).toBe(1);
    expect(effect('ck').params).toMatchObject({ keyR: 1, keyG: 128 / 255, keyB: 0 });
    expect(effect('ck').keys).toBeUndefined();
  });

  it('animated: ONE step writes all three keys; undo removes them exactly', () => {
    state().setPlayhead(3);
    toggleAnimatedCmd('c1', key('keyR'), KEY_TARGETS('ck'));
    expect(depth()).toBe(1);
    expect(Object.keys(effect('ck').keys!).sort()).toEqual(['keyB', 'keyG', 'keyR']);
    const keyed = json(present());
    state().setPlayhead(4);
    setKeyColourCmd('c1', 'ck', '#0000ff');
    expect(depth()).toBe(2);
    expect(effect('ck').keys!.keyR.map((k) => [k.t, k.v])).toEqual([[2, 0], [3, 0]]);
    expect(effect('ck').keys!.keyG.map((k) => [k.t, k.v])).toEqual([[2, 1], [3, 0]]);
    expect(effect('ck').keys!.keyB.map((k) => [k.t, k.v])).toEqual([[2, 0], [3, 1]]);
    state().undo();
    expect(json(present())).toBe(keyed);
  });

  it('animated off the clip: toast and nothing written', () => {
    state().setPlayhead(3);
    toggleAnimatedCmd('c1', key('keyR'), KEY_TARGETS('ck'));
    state().setPlayhead(0);
    setKeyColourCmd('c1', 'ck', '#0000ff');
    expect(depth()).toBe(1);
    expect(toasts().join()).toMatch(/playhead onto the clip/);
  });

  it('the group stopwatch turns all three off in ONE step, keeping the shown colour', () => {
    state().setPlayhead(3);
    toggleAnimatedCmd('c1', key('keyR'), KEY_TARGETS('ck'));
    state().setPlayhead(4);
    setKeyColourCmd('c1', 'ck', '#0000ff');
    state().setPlayhead(3.5);
    const d = depth();
    toggleAnimatedCmd('c1', key('keyR'), KEY_TARGETS('ck'));
    expect(depth()).toBe(d + 1);
    expect(effect('ck').keys).toBeUndefined();
    expect(effect('ck').params.keyB).toBeCloseTo(0.5, 5);
  });

  it('the group key diamond adds then removes a key on all three params, ONE step each', () => {
    state().setPlayhead(3);
    toggleAnimatedCmd('c1', key('keyR'), KEY_TARGETS('ck'));
    state().setPlayhead(4);
    toggleKeyAtPlayheadCmd('c1', key('keyR'), KEY_TARGETS('ck'));
    expect(depth()).toBe(2);
    for (const k of Object.values(effect('ck').keys!)) expect(k).toHaveLength(2);
    toggleKeyAtPlayheadCmd('c1', key('keyR'), KEY_TARGETS('ck'));
    expect(depth()).toBe(3);
    for (const k of Object.values(effect('ck').keys!)) expect(k).toHaveLength(1);
  });
});

describe('effects with keys', () => {
  it('removing an effect removes its keys in ONE step and undo restores both exactly', () => {
    state().setPlayhead(3);
    toggleAnimatedCmd('c1', BRIGHT);
    const before = json(present());
    removeVideoEffectCmd('c1', 'fx');
    expect(depth()).toBe(2);
    expect(clip().effects.map((e) => e.id)).toEqual(['ck', 'mr']);
    state().undo();
    expect(json(present())).toBe(before);
  });

  it('applying a look replaces an animated stack in ONE step; undo restores the keys', () => {
    state().setPlayhead(3);
    toggleAnimatedCmd('c1', BRIGHT);
    const before = json(present());
    applyLookCmd('c1', 'tealOrange');
    expect(depth()).toBe(2);
    expect(clip().effects.some((e) => e.keys)).toBe(false);
    state().undo();
    expect(json(present())).toBe(before);
  });
});
