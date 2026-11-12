// The keyboard shortcut table (Plan 5 Task 8): shortcut -> store command, and the live key-selection routing of Delete.
import { deleteSelected, redo, rippleDeleteSelected, splitAtPlayhead, togglePlay, undo } from './commands';
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
};

/** O15: while timeline keys are selected, Delete/Backspace (with or without Shift) mean "delete keys", not clips. */
export const routeShortcut = (found: Shortcut): Shortcut => keyRouted(found, hasSelectedKeys());
