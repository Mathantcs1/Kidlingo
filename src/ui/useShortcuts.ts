import { useEffect, useRef } from 'react';
import { deleteSelected, redo, rippleDeleteSelected, splitAtPlayhead, togglePlay, undo } from './commands';
import { isKeyboardFocused } from './inputModality';
import { TRANSFORMING_CLASS } from './useTransformDrag';
import { isTextEntry, nativeSpaceTarget } from './keys';
import type { Shortcut } from './keys';
import { keyRouted, shortcutBlockedByRange, shortcutFor } from './keys';
import { NO_KEYS, setKeySel } from './keySelection';
import { deleteSelectedKeysCmd, hasSelectedKeys, jumpKeyCmd } from './keySelectionCommands';

const COMMANDS: Record<Shortcut, () => void> = {
  play: togglePlay,
  split: splitAtPlayhead,
  delete: deleteSelected,
  rippleDelete: rippleDeleteSelected,
  undo,
  redo,
  prevKey: () => jumpKeyCmd(-1),
  nextKey: () => jumpKeyCmd(1),
  deleteKeys: deleteSelectedKeysCmd,
};

function isTyping(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && isTextEntry(target as HTMLElement & { type?: string });
}

const isSpace = (e: KeyboardEvent): boolean => e.code === 'Space' || e.key === ' ';

/**
 * Space on a control the user reached with the keyboard (Tab) presses that control, as everywhere else on the web.
 * A control focused by a mouse click keeps Space = play/pause (clicking Play and then pressing Space must pause).
 */
function spacePressesControl(e: KeyboardEvent): boolean {
  const t = e.target;
  if (!isSpace(e) || !(t instanceof HTMLElement) || !isKeyboardFocused(t)) return false;
  return nativeSpaceTarget({
    tagName: t.tagName,
    type: t instanceof HTMLInputElement ? t.type : undefined,
    role: t.getAttribute('role'),
    hasHref: t.hasAttribute('href'),
  });
}

/** Global editor shortcuts; ignored while typing in a form field and while `enabled` is false. */
export function useShortcuts(enabled: boolean): void {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent): void => {
      if (!enabledRef.current || e.defaultPrevented || isTyping(e.target) || spacePressesControl(e)) return;
      // Space mid-drag on the preview would start playback under the gesture: swallow it until the drag ends.
      if (isSpace(e) && document.documentElement.classList.contains(TRANSFORMING_CLASS)) {
        e.preventDefault();
        return;
      }
      // Escape drops a timeline key selection (a diamond drag handles its own Escape first, in the capture phase).
      if (e.key === 'Escape' && hasSelectedKeys()) setKeySel(NO_KEYS);
      const parts = keyParts(e);
      const found = shortcutFor({ ...parts, repeat: false });
      if (!found) return;
      // O15: selected keyframes take Delete/Backspace before clips.
      const shortcut = keyRouted(found, hasSelectedKeys());
      if (e.target instanceof HTMLInputElement && shortcutBlockedByRange(e.target, shortcut)) return;
      e.preventDefault();
      // Held Space/S/Delete keys are swallowed rather than repeated (shortcutFor drops their repeats).
      if (shortcutFor(parts)) COMMANDS[shortcut]();
    };
    // A mouse-focused button would also "click" on Space keyup; there Space belongs to play/pause.
    const onKeyUp = (e: KeyboardEvent): void => {
      if (enabledRef.current && isSpace(e) && !isTyping(e.target) && !spacePressesControl(e)) e.preventDefault();
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
