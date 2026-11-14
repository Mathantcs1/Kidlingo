// The footer of the inspector's Animation section (Plan 5B §7, D8): copy / paste the selected timeline keys, copy /
// paste the whole animation, and Save as preset. All disabled on a locked track (pastes) or when there is nothing to do.
import { useEffect } from 'react';
import { hasAnimation } from '../core/animPayload';
import type { Clip } from '../core/model';
import { useAnimClipboard } from './animClipboard';
import { useKeySelection } from './keySelection';
import { ensureLibrary, useLibrary } from './presetLibraryStore';
import { openSavePreset } from './savePresetUi';
import { copyAnimCmd, copyKeysCmd, pasteAnimCmd, pasteKeysCmd } from './transferCommands';

interface Props {
  clip: Clip;
  disabled: boolean;
  lockTitle: string | undefined;
}

export default function AnimTransferBar({ clip, disabled, lockTitle }: Props) {
  const keysCopied = useAnimClipboard((s) => s.keys !== null);
  const animCopied = useAnimClipboard((s) => s.anim !== null);
  const keysSelected = useKeySelection((s) => s.sel.times.length > 0);
  const library = useLibrary((s) => s.state);
  useEffect(() => { void ensureLibrary(); }, []); // Save as preset needs to know whether the library is writable
  const animated = hasAnimation(clip);
  const saveBlocked = library && library.status !== 'ok' ? (library.status === 'readOnly' ? `The preset library is read-only: ${library.reason}` : 'Presets cannot be saved in this browser') : null;
  return (
    <div className="anim-transfer" role="group" aria-label="Copy animation">
      <button type="button" data-testid="kf-copy" disabled={!keysSelected} title={keysSelected ? 'Copy the selected keyframes (Ctrl/Cmd+C)' : 'Select keyframes on the timeline to copy them'} onClick={copyKeysCmd}>
        Copy keys
      </button>
      <button type="button" data-testid="kf-paste" disabled={disabled || !keysCopied} title={lockTitle ?? (keysCopied ? 'Paste the copied keyframes at the playhead (Ctrl/Cmd+V)' : 'Copy keyframes first')} onClick={pasteKeysCmd}>
        Paste keys
      </button>
      <button type="button" data-testid="anim-copy" disabled={!animated} title={animated ? 'Copy this clip\'s whole animation (Ctrl/Cmd+Alt+C)' : 'This clip has no animation'} onClick={copyAnimCmd}>
        Copy animation
      </button>
      <button type="button" data-testid="anim-paste" disabled={disabled || !animCopied} title={lockTitle ?? (animCopied ? 'Replace the selected clips\' animation with the copied one (Ctrl/Cmd+Alt+V)' : 'Copy an animation first')} onClick={() => pasteAnimCmd()}>
        Paste animation
      </button>
      <button type="button" data-testid="preset-save" disabled={!animated || saveBlocked !== null} title={saveBlocked ?? (animated ? 'Save this animation to your preset library' : 'This clip has no animation')} onClick={() => openSavePreset(clip.id)}>
        Save as preset…
      </button>
    </div>
  );
}
