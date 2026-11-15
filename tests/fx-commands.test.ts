import { describe, it, expect, vi, beforeEach } from 'vitest';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { addClip } from '../src/core/timeline';

const lutImport = vi.hoisted(() => ({ importLut: vi.fn() }));
vi.mock('../src/media/lutImport', () => lutImport);

import { useEditor } from '../src/state/store';
import { useToasts } from '../src/ui/Toast';
import {
  addClipFx, applyClipLook, copyClipFx, hasCopiedFx, importLutFile, moveClipFx, pasteClipFx, removeClipFx, resetClipFx, toggleFxBypass,
  updateClipFx,
} from '../src/ui/fxCommands';

const clip = (id: string, kind: Clip['kind'], start = 0): Clip => ({
  id, mediaId: 'm', kind, start, in: 0, out: 2, transform: defaultTransform(), volume: 1, fit: 'fit', audio: defaultClipAudio(), fx: [],
});

function project(): Project {
  let p = emptyProject();
  const v = p.tracks.find((t) => t.kind === 'video')!.id;
  const a = p.tracks.find((t) => t.kind === 'audio')!.id;
  p = addClip(p, v, clip('c1', 'image'));
  p = addClip(p, v, clip('c2', 'image', 5));
  return addClip(p, a, clip('au', 'audio'));
}
const state = () => useEditor.getState();
const depth = (): number => state().history.past.length;
const fxOf = (id: string) => state().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!.fx;
const toasts = (): string[] => useToasts.getState().toasts.map((t) => t.message);

beforeEach(() => {
  state().loadProject(project());
  useToasts.setState({ toasts: [] });
  lutImport.importLut.mockReset();
});

describe('each command is exactly one undo step', () => {
  it('add, update, reset, move, look, remove', () => {
    const d0 = depth();
    addClipFx('c1', 'blur');
    addClipFx('c1', 'color');
    expect(depth()).toBe(d0 + 2);
    const [blur, color] = fxOf('c1');
    updateClipFx('c1', blur.id, { params: { radius: 30 } });
    expect(depth()).toBe(d0 + 3);
    expect(fxOf('c1')[0].params.radius).toBe(30);
    resetClipFx('c1', blur.id, 'blur');
    expect(depth()).toBe(d0 + 4);
    expect(fxOf('c1')[0].params.radius).toBe(8);
    moveClipFx('c1', color.id, 0);
    expect(depth()).toBe(d0 + 5);
    expect(fxOf('c1')[0].id).toBe(color.id);
    applyClipLook('c1', 'moody', 0.5);
    expect(depth()).toBe(d0 + 6);
    removeClipFx('c1', blur.id);
    expect(depth()).toBe(d0 + 7);
    expect(toasts()).toEqual([]);
  });

  it('refusals become toasts and leave history alone', () => {
    const d0 = depth();
    addClipFx('au', 'blur');
    expect(toasts()[0]).toMatch(/no picture/);
    expect(depth()).toBe(d0);
    removeClipFx('c1', 'nope');
    expect(toasts()).toHaveLength(2);
    expect(depth()).toBe(d0);
  });
});

describe('copy and paste', () => {
  it('copying an empty clip errors; paste needs a copy first; paste is one undo step with new ids', () => {
    expect(copyClipFx('c1')).toBe(false);
    expect(toasts()[0]).toMatch(/no effects to copy/);
    addClipFx('c1', 'blur');
    addClipFx('c1', 'sepia');
    expect(copyClipFx('c1')).toBe(true);
    expect(hasCopiedFx()).toBe(true);
    const d0 = depth();
    pasteClipFx('c2');
    expect(depth()).toBe(d0 + 1);
    const src = fxOf('c1');
    const dst = fxOf('c2');
    expect(dst.map((e) => e.type)).toEqual(['blur', 'sepia']);
    expect(dst.map((e) => e.id).some((id) => src.map((e) => e.id).includes(id))).toBe(false);
  });

  it('pasting onto an audio clip is refused', () => {
    addClipFx('c1', 'blur');
    copyClipFx('c1');
    const d0 = depth();
    useToasts.setState({ toasts: [] });
    pasteClipFx('au');
    expect(depth()).toBe(d0);
    expect(toasts()[0]).toMatch(/no picture/);
  });
});

describe('importLutFile', () => {
  it('adds the LUT and points the effect at it in ONE undo step', async () => {
    addClipFx('c1', 'lut');
    const id = fxOf('c1')[0].id;
    lutImport.importLut.mockResolvedValue({ id: 'l1', name: 'Warm', size: 33 });
    const d0 = depth();
    await importLutFile(new File(['x'], 'a.cube'), { clipId: 'c1', fxId: id });
    expect(depth()).toBe(d0 + 1);
    expect(state().history.present.luts.l1).toEqual({ id: 'l1', name: 'Warm', size: 33 });
    expect(fxOf('c1')[0].ref).toBe('l1');
  });

  it('shows the parser reason for a bad file and changes nothing', async () => {
    lutImport.importLut.mockRejectedValue(new Error('This is a 1D LUT'));
    const d0 = depth();
    await importLutFile(new File(['x'], 'a.cube'));
    expect(toasts()).toEqual(['This is a 1D LUT']);
    expect(depth()).toBe(d0);
    expect(state().history.present.luts).toEqual({});
  });
});

describe('toggleFxBypass', () => {
  it('flips the preview-only flag without touching history', () => {
    const d0 = depth();
    expect(state().fxBypass).toBe(false);
    toggleFxBypass();
    expect(state().fxBypass).toBe(true);
    toggleFxBypass();
    expect(state().fxBypass).toBe(false);
    expect(depth()).toBe(d0);
  });
});
