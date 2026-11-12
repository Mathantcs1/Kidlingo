// Plan 5 Task 8: timeline key selection (non-history UI state), its pruning, and the keyboard routing of Delete and
// `[` / `]` (keys before clips; no history for selection or jumps).
import { beforeEach, describe, expect, it } from 'vitest';
import type { Clip, Keyframe, Project } from '../src/core/model';
import { useEditor } from '../src/state/store';
import { useToasts } from '../src/ui/Toast';
import { keyRouted, shortcutFor } from '../src/ui/keys';
import { NO_KEYS, isPicked, pickKey, pruneKeySel, selectedRefs, useKeySelection } from '../src/ui/keySelection';
import { deleteRouted, jumpKeyCmd, moveSelectedKeysCmd, selectKeyCmd } from '../src/ui/keySelectionCommands';
import { base, video } from './overlay-fixtures';

const lin = { kind: 'linear' } as const;
const k = (t: number, v = 1): Keyframe => ({ t, v, ease: lin });
const state = () => useEditor.getState();
const sel = () => useKeySelection.getState().sel;
const depth = () => state().history.past.length;
const present = () => state().history.present;
const clip = (id = 'c1'): Clip | undefined => present().tracks.flatMap((t) => t.clips).find((c) => c.id === id);
const toasts = () => useToasts.getState().toasts.map((t) => t.message);

/** c1: sourced, source 1..5 s at timeline 2..6 (local = t − 1); scale keys at local 1.5 and 3; opacity at 3. */
const keyed = (): Clip => video('c1', { start: 2, in: 1, out: 5, keys: { scale: [k(1.5), k(3, 2)], opacity: [k(3, 0.5)] } });

function project(clips: Clip[], locked = false): Project {
  const p = base();
  return { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, locked, clips } : t)) };
}

function load(clips: Clip[] = [keyed(), video('c2', { start: 7, in: 0, out: 2 })], locked = false): void {
  state().loadProject(project(clips, locked));
  state().select(['c1']);
}

beforeEach(() => {
  load();
  useToasts.setState({ toasts: [] });
  useKeySelection.setState({ sel: NO_KEYS });
});

describe('pickKey / isPicked', () => {
  it('a plain pick replaces; an additive pick toggles on the same clip; another clip starts over', () => {
    let s = pickKey(NO_KEYS, 'c1', 1.5, false);
    expect(s).toEqual({ clipId: 'c1', times: [1.5] });
    s = pickKey(s, 'c1', 3, true);
    expect(s.times).toEqual([1.5, 3]);
    expect(isPicked(s, 'c1', 3.00001)).toBe(true);
    s = pickKey(s, 'c1', 1.5, true);
    expect(s.times).toEqual([3]);
    expect(pickKey(s, 'c1', 3, true)).toEqual(NO_KEYS);
    expect(pickKey(s, 'c9', 1, true)).toEqual({ clipId: 'c9', times: [1] });
    expect(pickKey(s, 'c1', 1.5, false)).toEqual({ clipId: 'c1', times: [1.5] });
  });
});

describe('pruneKeySel', () => {
  it('same object when every time still has a key; drops vanished times; clears for an unselected or missing clip', () => {
    const p = project([keyed()]);
    const s = { clipId: 'c1', times: [1.5, 3] };
    expect(pruneKeySel(s, p, ['c1'])).toBe(s);
    expect(pruneKeySel(NO_KEYS, p, ['c1'])).toBe(NO_KEYS);
    const fewer = project([{ ...keyed(), keys: { scale: [k(3)] } }]);
    expect(pruneKeySel(s, fewer, ['c1'])).toEqual({ clipId: 'c1', times: [3] });
    expect(pruneKeySel(s, p, ['c2'])).toEqual(NO_KEYS);
    expect(pruneKeySel(s, project([]), ['c1'])).toEqual(NO_KEYS);
    // A trim that hides the key at local 1.5 (now outside the visible range) drops it.
    const trimmed = project([{ ...keyed(), start: 3, in: 2 }]);
    expect(pruneKeySel(s, trimmed, ['c1'])).toEqual({ clipId: 'c1', times: [3] });
  });
});

describe('selectedRefs', () => {
  it('one ref per animated target at each time (the chroma key colour gives three)', () => {
    const chroma = video('c1', {
      start: 2, in: 1, out: 5,
      effects: [{ id: 'ck', type: 'chromaKey', enabled: true, params: { keyR: 0, keyG: 1, keyB: 0, tolerance: 0.3, softness: 0.1, spill: 0.5 },
        keys: { keyR: [k(2, 0)], keyG: [k(2, 1)], keyB: [k(2, 0)] } }],
    } as Partial<Clip>);
    expect(selectedRefs(chroma, [2]).map((r) => (r.target.kind === 'effect' ? r.target.param : r.target.prop))).toEqual(['keyR', 'keyG', 'keyB']);
    expect(selectedRefs(keyed(), [3]).length).toBe(2);
  });
});

describe('the selection store follows the editor', () => {
  it('selectKeyCmd selects and seeks (no history); prunes on edits; clears on clip selection change, undo and redo', () => {
    selectKeyCmd('c1', 1.5, false);
    expect(sel()).toEqual({ clipId: 'c1', times: [1.5] });
    expect(state().playhead).toBeCloseTo(2.5, 9);
    expect(depth()).toBe(0);
    selectKeyCmd('c1', 3, true);
    expect(sel().times).toEqual([1.5, 3]);
    // An edit that removes the scale key at 1.5 prunes it.
    state().apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'c1' ? { ...c, keys: { opacity: [k(3)] } } : c)) })) }));
    expect(sel()).toEqual({ clipId: 'c1', times: [3] });
    state().undo();
    expect(sel()).toEqual(NO_KEYS);
    selectKeyCmd('c1', 3, false);
    state().redo();
    expect(sel()).toEqual(NO_KEYS);
    state().undo();
    selectKeyCmd('c1', 3, false);
    state().select(['c1']); // a new selection (even of the same clip: a click on the clip body) clears
    expect(sel()).toEqual(NO_KEYS);
  });
});

describe('moveSelectedKeysCmd', () => {
  it('ONE step; the selection follows the moved keys; a refusal is a toast with no step', () => {
    selectKeyCmd('c1', 3, false);
    moveSelectedKeysCmd(0.5);
    expect(depth()).toBe(1);
    expect(clip()!.keys).toEqual({ scale: [k(1.5), k(3.5, 2)], opacity: [k(3.5, 0.5)] });
    expect(sel()).toEqual({ clipId: 'c1', times: [3.5] });
    moveSelectedKeysCmd(-2);
    expect(depth()).toBe(1);
    expect(toasts()).toContain('Keyframes would overlap');
    expect(sel()).toEqual({ clipId: 'c1', times: [3.5] });
  });
});

describe('Delete routing (O15: selected keys before clips)', () => {
  it('keyRouted sends Delete/Backspace (and Shift) to the keys only while keys are selected', () => {
    expect(keyRouted('delete', true)).toBe('deleteKeys');
    expect(keyRouted('rippleDelete', true)).toBe('deleteKeys');
    expect(keyRouted('delete', false)).toBe('delete');
    expect(keyRouted('split', true)).toBe('split');
  });

  it('first Delete removes the selected keys (ONE step, clip kept); the next Delete removes the clip', () => {
    selectKeyCmd('c1', 3, false);
    deleteRouted('delete');
    expect(depth()).toBe(1);
    expect(clip()!.keys).toEqual({ scale: [k(1.5)] }); // opacity's last key removed => static at its value
    expect(clip()!.transform.opacity).toBe(0.5);
    expect(sel()).toEqual(NO_KEYS);
    deleteRouted('delete');
    expect(depth()).toBe(2);
    expect(clip()).toBeUndefined();
  });

  it('locked track: the key delete is refused with a toast and does NOT fall back to the clip', () => {
    load([keyed()], true);
    selectKeyCmd('c1', 1.5, false);
    deleteRouted('delete');
    expect(depth()).toBe(0);
    expect(clip()).toBeDefined();
    expect(toasts()).toContain('Track is locked');
  });
});

describe('[ / ] jump between keys of the selected clip', () => {
  it('maps the keys and moves the playhead only', () => {
    const key = (k2: string) => ({ key: k2, code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false });
    expect(shortcutFor(key('['))).toBe('prevKey');
    expect(shortcutFor(key(']'))).toBe('nextKey');
    expect(shortcutFor({ ...key('['), ctrlKey: true })).toBeNull();
    state().setPlayhead(2);
    jumpKeyCmd(1);
    expect(state().playhead).toBeCloseTo(2.5, 9);
    jumpKeyCmd(1);
    expect(state().playhead).toBeCloseTo(4, 9);
    jumpKeyCmd(1);
    expect(state().playhead).toBeCloseTo(4, 9);
    jumpKeyCmd(-1);
    expect(state().playhead).toBeCloseTo(2.5, 9);
    expect(depth()).toBe(0);
    state().select([]);
    jumpKeyCmd(1);
    expect(state().playhead).toBeCloseTo(2.5, 9);
  });
});
