import { beforeEach, describe, expect, it } from 'vitest';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';
import { useEditor } from '../src/state/store';
import { useToasts } from '../src/ui/Toast';
import {
  addMenuGroups, addVideoEffectCmd, applyLookCmd, hexToKey, keyToHex, lutStatus, moveVideoEffectCmd,
  removeVideoEffectCmd, setBlendCmd, setKeyColourCmd, updateVideoEffectCmd,
} from '../src/ui/videoEffectCommands';
import { VIDEO_EFFECTS } from '../src/core/videoEffects';

const clip: Clip = {
  id: 'c1', mediaId: 'img', kind: 'image', start: 0, in: 0, out: 3, transform: defaultTransform(), volume: 1,
  fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal',
};
const img = { id: 'img', name: 'img', kind: 'image', duration: 3, hasAudio: false } as MediaRef;
const lut = { id: 'lut1', name: 'Warm', kind: 'lut', duration: 0, hasAudio: false } as MediaRef;

function project(locked = false): Project {
  const p = emptyProject();
  return {
    ...p,
    media: { img, lut1: lut },
    tracks: p.tracks.map((t) => (t.kind === 'video' ? { ...t, locked, clips: [clip] } : t)),
  };
}
const state = () => useEditor.getState();
const stack = () => state().history.present.tracks.flatMap((t) => t.clips)[0].effects;
const depth = () => state().history.past.length;
const toasts = () => useToasts.getState().toasts.map((t) => t.message);

beforeEach(() => {
  state().loadProject(project());
  useToasts.setState({ toasts: [] });
});

describe('videoEffectCommands', () => {
  it('each command is exactly one undo step', () => {
    const d0 = depth();
    addVideoEffectCmd('c1', 'colour');
    expect(depth()).toBe(d0 + 1);
    const id = stack()[0].id;
    updateVideoEffectCmd('c1', id, { params: { brightness: 0.5 } });
    expect(depth()).toBe(d0 + 2);
    expect(stack()[0].params.brightness).toBe(0.5);
    updateVideoEffectCmd('c1', id, { enabled: false });
    expect(depth()).toBe(d0 + 3);
    addVideoEffectCmd('c1', 'invert');
    moveVideoEffectCmd('c1', stack()[1].id, 0);
    expect(stack().map((e) => e.type)).toEqual(['invert', 'colour']);
    removeVideoEffectCmd('c1', id);
    expect(stack().map((e) => e.type)).toEqual(['invert']);
    expect(depth()).toBe(d0 + 6);
  });

  it('a no-op update adds no undo step', () => {
    addVideoEffectCmd('c1', 'colour');
    const d = depth();
    updateVideoEffectCmd('c1', stack()[0].id, { params: { brightness: 0 } });
    expect(depth()).toBe(d);
  });

  it('applyLookCmd is one step and undo restores the previous stack exactly', () => {
    addVideoEffectCmd('c1', 'blur');
    const before = state().history.present;
    const d = depth();
    applyLookCmd('c1', 'tealOrange');
    expect(depth()).toBe(d + 1);
    expect(stack().map((e) => e.type)).toEqual(['colour', 'splitTone']);
    state().undo();
    expect(state().history.present).toBe(before);
  });

  it('the 9th effect is refused with a plain-English toast and no change', () => {
    for (let i = 0; i < 8; i++) addVideoEffectCmd('c1', 'invert');
    const d = depth();
    addVideoEffectCmd('c1', 'invert');
    expect(stack()).toHaveLength(8);
    expect(depth()).toBe(d);
    expect(toasts()).toEqual(['At most 8 effects per clip']);
  });

  it('a lut needs a LUT file; with one it is added with its ref', () => {
    addVideoEffectCmd('c1', 'lut');
    expect(stack()).toHaveLength(0);
    expect(toasts()).toHaveLength(1);
    addVideoEffectCmd('c1', 'lut', 'lut1');
    expect(stack()[0]).toMatchObject({ type: 'lut', ref: 'lut1' });
  });

  it('a locked track refuses every command with a toast', () => {
    state().loadProject(project(true));
    addVideoEffectCmd('c1', 'colour');
    applyLookCmd('c1', 'bw');
    expect(stack()).toHaveLength(0);
    expect(toasts()).toHaveLength(2);
  });

  it('setKeyColourCmd commits keyR, keyG and keyB in ONE apply', () => {
    addVideoEffectCmd('c1', 'chromaKey');
    const d = depth();
    setKeyColourCmd('c1', stack()[0].id, '#ff8000');
    expect(depth()).toBe(d + 1);
    const { keyR, keyG, keyB } = stack()[0].params;
    expect([keyR, keyG]).toEqual([1, 128 / 255]);
    expect(keyB).toBe(0);
    state().undo();
    expect(stack()[0].params).toMatchObject({ keyR: 0, keyG: 1, keyB: 0 });
  });
});

describe('colour helpers', () => {
  it('hex and key colour round-trip', () => {
    expect(hexToKey('#00ff00')).toEqual({ keyR: 0, keyG: 1, keyB: 0 });
    expect(keyToHex({ keyR: 0, keyG: 1, keyB: 0 })).toBe('#00ff00');
    for (const h of ['#000000', '#ffffff', '#336699', '#808080']) expect(keyToHex(hexToKey(h))).toBe(h);
  });
});

describe('add menu groups', () => {
  it('group available effects by schema group; lut is chosen from the LUT list, not the menu', () => {
    const groups = addMenuGroups();
    const all = groups.flatMap((g) => g.types);
    expect(all).not.toContain('lut');
    expect(new Set(all).size).toBe(all.length);
    for (const g of groups) for (const t of g.types) expect(VIDEO_EFFECTS[t].group).toBe(g.group);
    expect(all).toContain('chromaKey');
    expect(groups.map((g) => g.group)).toEqual(['colour', 'look', 'blur', 'stylise', 'key']);
  });
});

describe('lutStatus', () => {
  it('ok, missing flag, and absent media', () => {
    const p = project();
    expect(lutStatus(p, 'lut1')).toBe('ok');
    expect(lutStatus({ ...p, media: { ...p.media, lut1: { ...lut, missing: true } } }, 'lut1')).toBe('missing');
    expect(lutStatus(p, 'gone')).toBe('missing');
    expect(lutStatus(p, undefined)).toBe('missing');
  });
});

describe('setBlendCmd', () => {
  const blend = () => state().history.present.tracks.flatMap((t) => t.clips)[0].blend;

  it('changes the blend mode in ONE undo step; the same mode again is no step; Undo restores normal', () => {
    const d0 = depth();
    setBlendCmd('c1', 'multiply');
    expect(blend()).toBe('multiply');
    expect(depth()).toBe(d0 + 1);
    setBlendCmd('c1', 'multiply');
    expect(depth()).toBe(d0 + 1);
    state().undo();
    expect(blend()).toBe('normal');
  });

  it('a locked track refuses with a toast and no step', () => {
    state().loadProject(project(true));
    const d0 = depth();
    setBlendCmd('c1', 'screen');
    expect(blend()).toBe('normal');
    expect(depth()).toBe(d0);
    expect(toasts().length).toBe(1);
  });
});
