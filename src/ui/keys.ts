// DOM-free keyboard helpers for the editor shortcuts.

export type Shortcut = 'play' | 'split' | 'delete' | 'rippleDelete' | 'undo' | 'redo';

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
  return null;
}
