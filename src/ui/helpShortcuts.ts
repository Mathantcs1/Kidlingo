// The keyboard shortcut table of the guide. It is typed against keys.ts's Shortcut union (adding a shortcut there
// fails the typecheck until it is documented here) and every row carries a sample key press that the unit test runs
// through `shortcutFor`, so the table cannot drift from the real key map.
import type { KeyLike, Shortcut } from './keys';

export interface ShortcutDoc {
  keys: string;
  what: string;
  /** A key press that must map to this shortcut (tests/help-content.test.ts). */
  sample: Partial<KeyLike>;
  /** Only while timeline keyframes are selected (keyRouted). */
  whenKeysSelected?: boolean;
}

export const SHORTCUT_DOCS: Record<Shortcut, ShortcutDoc> = {
  play: { keys: 'Space', what: 'Play / Pause', sample: { key: ' ', code: 'Space' } },
  split: { keys: 'S', what: 'Split the selected clips at the playhead', sample: { key: 's', code: 'KeyS' } },
  delete: { keys: 'Delete or Backspace', what: 'Delete the selected clips', sample: { key: 'Delete', code: 'Delete' } },
  rippleDelete: { keys: 'Shift+Delete', what: 'Delete the selected clips and close the gap', sample: { key: 'Delete', code: 'Delete', shiftKey: true } },
  undo: { keys: 'Mod+Z', what: 'Undo', sample: { key: 'z', code: 'KeyZ', ctrlKey: true } },
  redo: { keys: 'Mod+Shift+Z', what: 'Redo (Ctrl+Y also works on Windows and Linux)', sample: { key: 'z', code: 'KeyZ', ctrlKey: true, shiftKey: true } },
  prevKey: { keys: '[', what: 'Jump to the previous keyframe of the selected clip', sample: { key: '[', code: 'BracketLeft' } },
  nextKey: { keys: ']', what: 'Jump to the next keyframe of the selected clip', sample: { key: ']', code: 'BracketRight' } },
  deleteKeys: { keys: 'Delete or Backspace', what: 'Delete the selected timeline keyframes instead of the clips', sample: { key: 'Delete', code: 'Delete' }, whenKeysSelected: true },
  copy: { keys: 'Mod+C', what: 'Copy the selected clips', sample: { key: 'c', code: 'KeyC', ctrlKey: true } },
  paste: { keys: 'Mod+V', what: 'Paste what was copied last (clips at the playhead on the active track, keys at the playhead)', sample: { key: 'v', code: 'KeyV', ctrlKey: true } },
  duplicate: { keys: 'Mod+D', what: 'Duplicate the selected clips right after them', sample: { key: 'd', code: 'KeyD', ctrlKey: true } },
  copyKeys: { keys: 'Mod+C', what: 'Copy the selected timeline keyframes', sample: { key: 'c', code: 'KeyC', ctrlKey: true }, whenKeysSelected: true },
  copyAnim: { keys: 'Mod+Alt+C', what: "Copy the selected clip's whole animation", sample: { key: 'c', code: 'KeyC', ctrlKey: true, altKey: true } },
  pasteAnim: { keys: 'Mod+Alt+V', what: "Replace the selected clips' animation with the copied one", sample: { key: 'v', code: 'KeyV', ctrlKey: true, altKey: true } },
};

/** Keys that are handled by a control rather than the global key map. */
export const OTHER_KEYS: [string, string][] = [
  ['F2 or Enter on a track name', 'Rename the track'],
  ['Esc', 'Cancel a drag, close a menu or dialog, drop a keyframe selection, discard a voice-over take'],
  ['Alt (Option) while dragging', 'Switch snapping off'],
  ['Shift while rotating on the preview', 'Snap the angle to 15° steps'],
  ['Shift, Ctrl or Cmd + click a clip', 'Select more than one clip'],
  ['Up / Down in a number field', 'Step the value (Shift = ×10); Enter commits, Esc reverts'],
  ['Enter on the "Effect to add" list', 'Add the chosen effect'],
];
