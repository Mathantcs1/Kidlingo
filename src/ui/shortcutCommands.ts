// The keyboard shortcut table (Plan 5 Task 8): shortcut -> store command, and the live key-selection routing of Delete.
import { deleteSelected, redo, rippleDeleteSelected, splitAtPlayhead, togglePlay, undo } from './commands';
import { canCopyClips, canPasteClips, copyClipsCmd, duplicateClipsCmd, pasteClipsCmd } from './clipClipboardCommands';
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
  paste: pasteClipsCmd,
  duplicate: duplicateClipsCmd,
};

/**
 * Whether the app takes this chord. Copy, paste and duplicate are claimed only when they have something to do, and
 * never over selected text on the page, so the browser's own copy/paste keeps working everywhere else (text fields
 * are filtered earlier by useShortcuts). Every other shortcut is always claimed.
 */
export function claims(s: Shortcut, hasTextSelected: boolean): boolean {
  if (s === 'copy') return !hasTextSelected && !hasSelectedKeys() && canCopyClips();
  if (s === 'paste') return copySource() === 'clips' && canPasteClips();
  if (s === 'duplicate') return canCopyClips();
  return true;
}

/** O15: while timeline keys are selected, Delete/Backspace (with or without Shift) mean "delete keys", not clips. */
export const routeShortcut = (found: Shortcut): Shortcut => keyRouted(found, hasSelectedKeys());
