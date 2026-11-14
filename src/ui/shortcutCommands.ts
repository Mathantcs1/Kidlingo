// The keyboard shortcut table (Plan 5 Task 8): shortcut -> store command, and the live key-selection routing of Delete.
import { deleteSelected, redo, rippleDeleteSelected, splitAtPlayhead, togglePlay, undo } from './commands';
import { animPayload, keysPayload } from './animClipboard';
import { canCopyClips, canPasteClips, copyClipsCmd, duplicateClipsCmd } from './clipClipboardCommands';
import { canCopyAnim, copyAnimCmd, copyKeysCmd, pasteAnimCmd, pasteCopiedCmd } from './transferCommands';
import { copySource } from './copySource';
import { keyRouted } from './keys';
import type { Shortcut } from './keys';
import { deleteSelectedKeysCmd, hasSelectedKeys, jumpKeyCmd } from './keySelectionCommands';

export const COMMANDS: Record<Shortcut, () => void> = {
  play: togglePlay,
  split: splitAtPlayhead,
  delete: deleteSelected,
  rippleDelete: rippleDeleteSelected,
  undo,
  redo,
  prevKey: () => jumpKeyCmd(-1),
  nextKey: () => jumpKeyCmd(1),
  deleteKeys: deleteSelectedKeysCmd,
  copy: copyClipsCmd,
  paste: pasteCopiedCmd,
  duplicate: duplicateClipsCmd,
  copyKeys: copyKeysCmd,
  copyAnim: copyAnimCmd,
  pasteAnim: () => pasteAnimCmd(),
};

/**
 * Whether the app takes this chord. The clipboard chords are claimed only when they have something to do, and never
 * over selected text on the page, so the browser's own copy/paste keeps working everywhere else (text fields are
 * filtered earlier by useShortcuts). Precedence: selected keys copy keys (routeShortcut), otherwise clips; paste
 * pastes what was copied last. Every other shortcut is always claimed.
 */
export function claims(s: Shortcut, hasTextSelected: boolean): boolean {
  if (s === 'copy') return !hasTextSelected && !hasSelectedKeys() && canCopyClips();
  if (s === 'copyKeys') return !hasTextSelected && hasSelectedKeys();
  if (s === 'copyAnim') return !hasTextSelected && canCopyAnim();
  if (s === 'pasteAnim') return animPayload() !== null;
  if (s === 'duplicate') return canCopyClips();
  if (s === 'paste') {
    const kind = copySource();
    return kind === 'clips' ? canPasteClips() : kind === 'keys' ? keysPayload() !== null : kind === 'anim' && animPayload() !== null;
  }
  return true;
}

/** O15: while timeline keys are selected, Delete/Backspace (with or without Shift) mean "delete keys", not clips; Ctrl/Cmd+C copies the keys. */
export const routeShortcut = (found: Shortcut): Shortcut => keyRouted(found, hasSelectedKeys());
