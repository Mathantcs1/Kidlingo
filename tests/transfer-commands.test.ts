// Plan 5B Task 9: store-bound animation transfer: ONE undo step per paste (several clips included), refusals and skips
// are toasts, the clipboards are cleared when a project is loaded, shortcut routing (selected keys win the copy, paste
// pastes what was copied last, claims never swallow a chord that has nothing to do).
import { beforeEach, describe, expect, it } from 'vitest';
import { animPayload, keysPayload } from '../src/ui/animClipboard';
import { clipPayload } from '../src/ui/clipClipboard';
import { copyClipsCmd } from '../src/ui/clipClipboardCommands';
import { copySource } from '../src/ui/copySource';
import { setKeySel } from '../src/ui/keySelection';
import { keyRouted, shortcutBlockedByRange, shortcutFor } from '../src/ui/keys';
import { claims, routeShortcut } from '../src/ui/shortcutCommands';
import { applyUserPresetCmd, copyAnimCmd, copyKeysCmd, pasteAnimCmd, pasteCopiedCmd, pasteKeysCmd } from '../src/ui/transferCommands';
import { useToasts } from '../src/ui/Toast';
import { useEditor } from '../src/state/store';
import { copyAnimation } from '../src/core/animPayload';
import { presetFromAnimation } from '../src/core/userPresets';
import { clipOf, k, pk, project } from './anim-transfer.fixtures';

const state = () => useEditor.getState();
const depth = () => state().history.past.length;
const present = () => state().history.present;
const toasts = () => useToasts.getState().toasts.map((t) => t.message).join(' | ');

beforeEach(() => {
  state().loadProject(project({ V: { keys: { opacity: [k(0, 0), k(1, 1)], position: [pk(0, 0, 0), pk(1, 50, 0)] } }, O: {} }));
  useToasts.setState({ toasts: [] });
  setKeySel({ clipId: null, times: [] });
});

describe('keys', () => {
  it('copy needs selected keys; paste goes into every selected clip as ONE step, at the playhead', () => {
    state().select(['V']);
    copyKeysCmd();
    expect(keysPayload()).toBeNull();
    setKeySel({ clipId: 'V', times: [0, 1] });
    copyKeysCmd();
    expect(keysPayload()).not.toBeNull();
    expect(copySource()).toBe('keys');
    state().select(['O', 'P']);
    state().setPlayhead(0.5); // on O (0..4), not on P (10..14)
    const d = depth();
    pasteKeysCmd();
    expect(depth()).toBe(d);
    expect(toasts()).toMatch(/playhead onto the clip/);
    state().select(['O']);
    pasteKeysCmd();
    expect(depth()).toBe(d + 1);
    expect(clipOf(present(), 'O').keys!.opacity!.map((x) => x.t)).toEqual([0.5, 1.5]);
    state().undo();
    expect(clipOf(present(), 'O').keys).toBeUndefined();
  });

  it('a paste with nothing the clip can take is a toast and no step', () => {
    state().select(['V']);
    setKeySel({ clipId: 'V', times: [0] });
    copyKeysCmd();
    expect(keysPayload()).not.toBeNull();
    state().select(['AU']);
    state().setPlayhead(0);
    const d = depth();
    pasteKeysCmd();
    expect(depth()).toBe(d);
    expect(toasts()).toMatch(/Nothing could be pasted/);
  });
});

describe('whole animation', () => {
  it('copy needs ONE selected clip; paste replaces every selected clip in ONE step', () => {
    state().select(['V', 'O']);
    copyAnimCmd();
    expect(animPayload()).toBeNull();
    expect(toasts()).toMatch(/Select one clip/);
    state().select(['V']);
    copyAnimCmd();
    expect(animPayload()).not.toBeNull();
    expect(copySource()).toBe('anim');
    state().select(['O', 'P']);
    const d = depth();
    pasteAnimCmd();
    expect(depth()).toBe(d + 1);
    expect(clipOf(present(), 'O').keys!.opacity).toHaveLength(2);
    expect(clipOf(present(), 'P').keys!.opacity).toHaveLength(2);
    state().undo();
    expect(clipOf(present(), 'O').keys).toBeUndefined();
  });

  it('Ctrl/Cmd+V pastes what was copied last: clips, keys or the animation', () => {
    state().select(['V']);
    copyAnimCmd();
    copyClipsCmd();
    expect(copySource()).toBe('clips');
    expect(claims('paste', false)).toBe(true);
    state().setPlayhead(5);
    const clips = () => present().tracks[0].clips.length;
    const n = clips();
    pasteCopiedCmd(); // the last copy was the CLIP: a new clip at 5 s
    expect(clips()).toBe(n + 1);
    state().select(['V']);
    copyAnimCmd(); // now the last copy is the animation
    expect(copySource()).toBe('anim');
    state().select(['O']);
    pasteCopiedCmd();
    expect(clips()).toBe(n + 1);
    expect(clipOf(present(), 'O').keys!.opacity).toHaveLength(2);
  });

  it('applies a user preset in ONE step; the clipboards are cleared when a project is loaded', () => {
    state().select(['V']);
    const preset = presetFromAnimation(copyAnimation(present(), 'V'), 'Fade glide', 'custom', 1, 'u1');
    const d = depth();
    expect(applyUserPresetCmd('O', preset)).toBe(true);
    expect(depth()).toBe(d + 1);
    expect(clipOf(present(), 'O').keys!.position!.length).toBe(2);
    expect(applyUserPresetCmd('AU', preset)).toBe(false);
    expect(depth()).toBe(d + 1);
    copyAnimCmd();
    setKeySel({ clipId: 'V', times: [0] });
    copyKeysCmd();
    state().loadProject(project());
    expect(animPayload()).toBeNull();
    expect(keysPayload()).toBeNull();
    expect(clipPayload()).toBeNull();
    expect(copySource()).toBeNull();
  });
});

describe('shortcut routing', () => {
  it('selected keys route the copy chord to copyKeys; otherwise it stays a clip copy', () => {
    expect(keyRouted('copy', true)).toBe('copyKeys');
    expect(keyRouted('copy', false)).toBe('copy');
    state().select(['V']);
    expect(routeShortcut('copy')).toBe('copy');
    setKeySel({ clipId: 'V', times: [0] });
    expect(routeShortcut('copy')).toBe('copyKeys');
    expect(claims('copyKeys', false)).toBe(true);
    expect(claims('copyKeys', true)).toBe(false); // selected text on the page wins
    expect(claims('copy', false)).toBe(false);
  });

  it('claims nothing when there is nothing to paste or copy (the chord stays native)', () => {
    expect(claims('paste', false)).toBe(false);
    expect(claims('pasteAnim', false)).toBe(false);
    expect(claims('copyAnim', false)).toBe(false);
    state().select(['V']);
    expect(claims('copyAnim', false)).toBe(true);
    expect(claims('copyAnim', true)).toBe(false);
  });

  it('chords: Ctrl/Cmd+Alt+C and V by physical key; sliders and colour pickers keep every clipboard chord', () => {
    const e = (code: string, over = {}) => ({ key: 'ç', code, ctrlKey: true, metaKey: false, shiftKey: false, altKey: true, repeat: false, ...over });
    expect(shortcutFor(e('KeyC'))).toBe('copyAnim');
    expect(shortcutFor(e('KeyV', { ctrlKey: false, metaKey: true }))).toBe('pasteAnim');
    expect(shortcutFor(e('KeyC', { repeat: true }))).toBeNull();
    for (const s of ['copy', 'paste', 'duplicate', 'copyKeys', 'copyAnim', 'pasteAnim', 'delete', 'split'] as const) {
      expect(shortcutBlockedByRange({ tagName: 'INPUT', type: 'range' }, s), s).toBe(true);
    }
    for (const s of ['play', 'undo', 'redo', 'prevKey', 'nextKey'] as const) {
      expect(shortcutBlockedByRange({ tagName: 'INPUT', type: 'range' }, s), s).toBe(false);
    }
    expect(shortcutBlockedByRange({ tagName: 'INPUT', type: 'text' }, 'copy')).toBe(false);
  });
});
