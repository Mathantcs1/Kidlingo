// DOM-free keyboard helpers for the editor shortcuts.

export type Shortcut = 'play' | 'split' | 'delete' | 'rippleDelete' | 'undo' | 'redo' | 'prevKey' | 'nextKey' | 'deleteKeys';

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

/**
 * Range sliders and colour pickers own the editing keys: Delete/Backspace (and S) pressed on a focused slider or
 * picker must not delete or split clips. Undo/redo and Space keep their usual behaviour.
 */
export function shortcutBlockedByRange(t: TargetLike, s: Shortcut): boolean {
  return t.tagName.toUpperCase() === 'INPUT' && OWNS_EDITING_KEYS.has((t.type ?? '').toLowerCase()) && (s === 'delete' || s === 'rippleDelete' || s === 'deleteKeys' || s === 'split');
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
  return keysSelected && (s === 'delete' || s === 'rippleDelete') ? 'deleteKeys' : s;
}
