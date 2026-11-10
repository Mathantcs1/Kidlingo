import { useEffect, useRef } from 'react';
import { deleteSelected, redo, splitAtPlayhead, togglePlay, undo } from './commands';
import { isTextEntry } from './keys';
import type { Shortcut } from './keys';
import { shortcutFor } from './keys';

const COMMANDS: Record<Shortcut, () => void> = {
  play: togglePlay,
  split: splitAtPlayhead,
  delete: deleteSelected,
  undo,
  redo,
};

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && isTextEntry(target as HTMLElement & { type?: string });
}

const isSpace = (e: KeyboardEvent): boolean => e.code === 'Space' || e.key === ' ';

/** Global editor shortcuts; ignored while typing in a form field and while `enabled` is false. */
export function useShortcuts(enabled: boolean): void {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!enabledRef.current || e.defaultPrevented || isTyping(e.target)) return;
      const parts = keyParts(e);
      const shortcut = shortcutFor({ ...parts, repeat: false });
      if (!shortcut) return;
      e.preventDefault();
      // Held Space/S/Delete keys are swallowed rather than repeated (shortcutFor drops their repeats).
      if (shortcutFor(parts)) COMMANDS[shortcut]();
    };
    // A focused button would also "click" on Space keyup; Space belongs to play/pause.
    const onKeyUp = (e: KeyboardEvent): void => {
      if (enabledRef.current && isSpace(e) && !isTyping(e.target)) e.preventDefault();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}

function keyParts(e: KeyboardEvent) {
  return {
    key: e.key,
    code: e.code,
    ctrlKey: e.ctrlKey,
    metaKey: e.metaKey,
    shiftKey: e.shiftKey,
    altKey: e.altKey,
    repeat: e.repeat,
  };
}
