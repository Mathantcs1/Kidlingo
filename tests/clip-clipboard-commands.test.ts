// Clip copy / paste / duplicate commands: ONE undo step per paste, selection becomes the pasted clips, repeatable,
// refusals are toasts without a step, the clipboard is cleared when the project is replaced, shortcut claims.
import { beforeEach, describe, expect, it } from 'vitest';
import { clipPayload } from '../src/ui/clipClipboard';
import { canCopyClips, canPasteClips, copyClipsCmd, duplicateClipsCmd, pasteClipsCmd } from '../src/ui/clipClipboardCommands';
import { copySource } from '../src/ui/copySource';
import { setKeySel } from '../src/ui/keySelection';
import { claims } from '../src/ui/shortcutCommands';
import { shortcutFor } from '../src/ui/keys';
import { useToasts } from '../src/ui/Toast';
import { useEditor } from '../src/state/store';
import { project } from './keyframe-fixtures';
import type { Project } from '../src/core/model';

const state = () => useEditor.getState();
const depth = () => state().history.past.length;
const clips = (p: Project = state().history.present, track = 'v') => p.tracks.find((t) => t.id === track)!.clips;

beforeEach(() => {
  state().loadProject(project());
  useToasts.setState({ toasts: [] });
  setKeySel({ clipId: null, times: [] });
});

describe('copy and paste commands', () => {
  it('nothing selected: copy does nothing (and is not claimed)', () => {
    copyClipsCmd();
    expect(clipPayload()).toBeNull();
    expect(canCopyClips()).toBe(false);
    expect(claims('copy', false)).toBe(false);
    expect(claims('duplicate', false)).toBe(false);
  });

  it('copy then paste at three playhead times: three new clips at those starts, ONE undo step each, selection = the paste', () => {
    state().select(['c']);
    copyClipsCmd();
    expect(copySource()).toBe('clips');
    expect(claims('paste', false)).toBe(true);
    const d0 = depth();
    const base = state().history.present;
    const placed: number[] = [];
    for (const t of [40, 50, 60]) {
      state().setPlayhead(t);
      pasteClipsCmd();
      placed.push(t);
      expect(depth()).toBe(d0 + placed.length);
      const sel = state().selection;
      expect(sel).toHaveLength(1);
      const pasted = clips().find((c) => c.id === sel[0])!;
      expect(pasted.start).toBeCloseTo(t, 9);
      expect(pasted.id).not.toBe('c');
    }
    expect(clips().map((c) => c.start)).toEqual([10, 20, 30, 40, 50, 60]);
    expect(clips().filter((c) => c.mediaId === 'm1' && c.kind === 'video')).toHaveLength(4);
    // Undo three times restores the exact original project.
    state().undo(); state().undo(); state().undo();
    expect(JSON.stringify(state().history.present)).toBe(JSON.stringify(base));
    // The clipboard survives undo and pastes again.
    state().setPlayhead(70);
    pasteClipsCmd();
    expect(clips().some((c) => c.start === 70)).toBe(true);
  });

  it('paste goes to the active track when it fits, else the copied clip\'s track', () => {
    state().select(['c']);
    copyClipsCmd();
    state().setActiveTrack('a');
    state().setPlayhead(40);
    pasteClipsCmd();
    expect(clips(undefined, 'a').some((c) => c.start === 40)).toBe(false);
    expect(clips().some((c) => c.start === 40)).toBe(true);
    state().setActiveTrack('L'); // locked video track: refused with a toast, no step
    state().setPlayhead(60);
    const d = depth();
    pasteClipsCmd();
    expect(depth()).toBe(d);
    expect(useToasts.getState().toasts.map((t) => t.message).join()).toMatch(/locked/);
  });

  it('an overlap is refused: a toast, no undo step, the selection stays', () => {
    state().select(['c']);
    copyClipsCmd();
    state().setPlayhead(11);
    const d = depth();
    pasteClipsCmd();
    expect(depth()).toBe(d);
    expect(state().selection).toEqual(['c']);
    expect(useToasts.getState().toasts.map((t) => t.message).join()).toMatch(/overlap/);
  });

  it('duplicate: one step, right after the selection, selection = the copy', () => {
    state().select(['c']);
    const d = depth();
    duplicateClipsCmd();
    expect(depth()).toBe(d + 1);
    const sel = state().selection;
    expect(clips().find((c) => c.id === sel[0])!.start).toBe(14);
  });

  it('the clipboard is cleared when a project is loaded (New project / restore)', () => {
    state().select(['c']);
    copyClipsCmd();
    expect(canPasteClips()).toBe(true);
    state().loadProject(project());
    expect(canPasteClips()).toBe(false);
    expect(copySource()).toBeNull();
    expect(claims('paste', false)).toBe(false);
  });
});

describe('shortcut claims', () => {
  it('copy is not claimed while text is selected or timeline keys are selected', () => {
    state().select(['c']);
    expect(claims('copy', false)).toBe(true);
    expect(claims('copy', true)).toBe(false);
    setKeySel({ clipId: 'c', times: [0] });
    expect(claims('copy', false)).toBe(false);
  });

  it('chords map to copy / paste / duplicate, never with Shift and never repeated', () => {
    const k = (key: string, over = {}) => ({ key, code: `Key${key.toUpperCase()}`, ctrlKey: true, metaKey: false, shiftKey: false, altKey: false, repeat: false, ...over });
    expect(shortcutFor(k('c'))).toBe('copy');
    expect(shortcutFor(k('v', { ctrlKey: false, metaKey: true }))).toBe('paste');
    expect(shortcutFor(k('d'))).toBe('duplicate');
    expect(shortcutFor(k('c', { shiftKey: true }))).toBeNull();
    expect(shortcutFor(k('c', { repeat: true }))).toBeNull();
    expect(shortcutFor(k('c', { altKey: true }))).toBeNull();
  });
});
