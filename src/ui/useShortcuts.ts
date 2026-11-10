import { useEffect } from 'react';
import { deleteSelected, redo, splitAtPlayhead, togglePlay, undo } from './commands';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(target.tagName);
}

/** Maps a key event to its editor command, or null when the key is not a shortcut. */
function commandFor(e: KeyboardEvent): (() => void) | null {
  const mod = e.metaKey || e.ctrlKey;
  const key = e.key.toLowerCase();
  if (mod && !e.altKey) {
    if (key === 'z') return e.shiftKey ? redo : undo;
    if (key === 'y' && e.ctrlKey && !e.shiftKey) return redo;
    return null;
  }
  if (e.altKey || e.ctrlKey || e.metaKey) return null;
  if (e.code === 'Space' || e.key === ' ') return togglePlay;
  if (key === 's' && !e.shiftKey) return splitAtPlayhead;
  if (e.key === 'Delete' || e.key === 'Backspace') return deleteSelected;
  return null;
}

/** Global editor shortcuts; ignored while typing in a form field. */
export function useShortcuts(): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (e.defaultPrevented || isTyping(e.target)) return;
      const cmd = commandFor(e);
      if (!cmd) return;
      e.preventDefault();
      if (!e.repeat || cmd !== togglePlay) cmd();
    };
    // A focused button would also "click" on Space keyup; Space belongs to play/pause.
    const onKeyUp = (e: KeyboardEvent): void => {
      if ((e.code === 'Space' || e.key === ' ') && !isTyping(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
