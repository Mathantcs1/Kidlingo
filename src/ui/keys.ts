// DOM-free keyboard helpers for the editor shortcuts.

export type Shortcut = 'play' | 'split' | 'delete' | 'rippleDelete' | 'undo' | 'redo' | 'prevKey' | 'nextKey' | 'deleteKeys' | 'copy' | 'paste' | 'duplicate' | 'copyKeys' | 'copyAnim' | 'pasteAnim';

/** The parts of a KeyboardEvent the shortcut map reads. */
export interface KeyLike {
  key: string;
  code: string;
  ctrlKey: boolean;
  metaKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
  repeat: boolean;
}

/** The parts of an event target that decide whether keys belong to it. */
export interface TargetLike {
  tagName: string;
  type?: string;
  isContentEditable?: boolean;
}

const TEXT_INPUT_TYPES = new Set(['', 'text', 'search', 'number', 'email', 'url', 'password', 'tel']);

/** True for fields that take typed text (or keyboard choice): text-like inputs, select, textarea, contentEditable. */
export function isTextEntry(t: TargetLike): boolean {
  if (t.isContentEditable) return true;
  const tag = t.tagName.toUpperCase();
  if (tag === 'SELECT' || tag === 'TEXTAREA') return true;
  return tag === 'INPUT' && TEXT_INPUT_TYPES.has((t.type ?? '').toLowerCase());
}

const OWNS_EDITING_KEYS = new Set(['range', 'color']);
/** The only shortcuts a focused slider or colour picker leaves to the editor (undo/redo and play/pause, prev/next key). */
const EDIT_ALLOWED = new Set<Shortcut>(['play', 'undo', 'redo', 'prevKey', 'nextKey']);

/**
 * Range sliders and colour pickers own the editing keys: Delete/Backspace (and S) pressed on a focused slider or
 * picker must not delete or split clips. Undo/redo and Space keep their usual behaviour.
 */
export function shortcutBlockedByRange(t: TargetLike, s: Shortcut): boolean {
  return t.tagName.toUpperCase() === 'INPUT' && OWNS_EDITING_KEYS.has((t.type ?? '').toLowerCase()) && !EDIT_ALLOWED.has(s);
}

/** The parts of an element that decide whether Space activates it natively. */
export interface SpaceTargetLike {
  tagName: string;
  type?: string;
  role?: string | null;
  hasHref?: boolean;
}

const SPACE_INPUT_TYPES = new Set(['checkbox', 'radio', 'button', 'submit', 'reset']);
const SPACE_ROLES = new Set(['button', 'switch', 'checkbox']);

/** True for controls that Space presses natively: buttons, summary, links, checkable/button inputs, button roles. */
export function nativeSpaceTarget(t: SpaceTargetLike): boolean {
  const tag = t.tagName.toUpperCase();
  if (tag === 'BUTTON' || tag === 'SUMMARY') return true;
  if (tag === 'A' && t.hasHref) return true;
  if (tag === 'INPUT' && SPACE_INPUT_TYPES.has((t.type ?? '').toLowerCase())) return true;
  return SPACE_ROLES.has((t.role ?? '').toLowerCase());
}

/** Maps a key press to its shortcut; auto-repeat only repeats undo/redo. */
export function shortcutFor(e: KeyLike): Shortcut | null {
  const key = e.key.toLowerCase();
  if ((e.metaKey || e.ctrlKey) && !e.altKey) {
    if (key === 'z') return e.shiftKey ? 'redo' : 'undo';
    if (key === 'y' && e.ctrlKey && !e.shiftKey) return 'redo';
    // Clipboard chords (never held down: one press, one action).
    if (!e.shiftKey && !e.repeat) {
      // On a non-Latin layout (Cyrillic, Hebrew, ...) `key` is not a Latin letter: use the physical key instead.
      const letter = /^[a-z]$/.test(key) ? key : /^Key[A-Z]$/.test(e.code) ? e.code.slice(3).toLowerCase() : '';
      if (letter === 'c') return 'copy';
      if (letter === 'v') return 'paste';
      if (letter === 'd') return 'duplicate';
    }
    return null;
  }
  // Whole-animation copy/paste: Ctrl/Cmd+Alt+C / V (by physical key: Alt changes the character on a Mac).
  if ((e.metaKey || e.ctrlKey) && e.altKey && !e.shiftKey && !e.repeat) {
    if (e.code === 'KeyC') return 'copyAnim';
    if (e.code === 'KeyV') return 'pasteAnim';
    return null;
  }
  if (e.altKey || e.ctrlKey || e.metaKey || e.repeat) return null;
  if (e.code === 'Space' || e.key === ' ') return 'play';
  if (key === 's' && !e.shiftKey) return 'split';
  if (e.key === 'Delete' || e.key === 'Backspace') return e.shiftKey ? 'rippleDelete' : 'delete';
  if (e.key === '[') return 'prevKey';
  if (e.key === ']') return 'nextKey';
  return null;
}

/** O15: while timeline keyframes are selected, Delete/Backspace (with or without Shift) removes them, not the clips. */
export function keyRouted(s: Shortcut, keysSelected: boolean): Shortcut {
  if (!keysSelected) return s;
  if (s === 'delete' || s === 'rippleDelete') return 'deleteKeys';
  return s === 'copy' ? 'copyKeys' : s;
}
