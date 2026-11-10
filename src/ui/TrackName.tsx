import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Id } from '../core/model';
import { MAX_TRACK_NAME } from '../core/tracks';
import { currentModality, focusAs, isKeyboardFocused } from './inputModality';
import type { Modality } from './inputModality';
import { renameLayer } from './trackCommands';

interface TrackNameProps {
  trackId: Id;
  /** What is shown: the track's name, or its default label when it has none. */
  label: string;
  /** The stored name ('' when the default label is used). */
  name: string;
}

/**
 * A track's name. Double-click, or Enter / F2 (or Space after reaching it with Tab) while it has focus, edits it in
 * place: Enter or leaving the field commits once, Escape cancels; after Enter/Escape focus returns to the name.
 */
export default function TrackName({ trackId, label, name }: TrackNameProps) {
  const [editing, setEditing] = useState(false);
  const done = useRef(false);
  const refocus = useRef(false);
  const nameRef = useRef<HTMLSpanElement>(null);
  /** How editing was started (double-click or a key): focus returns to the name with the same modality. */
  const openedVia = useRef<Modality>('pointer');
  /** The key that opened the editor (Enter, F2, Space) is still held: its auto-repeats must not reach the field. */
  const openKeyHeld = useRef(false);

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    if (nameRef.current) focusAs(nameRef.current, openedVia.current);
  }, [editing]);

  const start = (viaKey: boolean): void => {
    done.current = false;
    openKeyHeld.current = viaKey;
    openedVia.current = currentModality();
    setEditing(true);
  };
  const finish = (value: string | null, viaKey: boolean): void => {
    if (done.current) return;
    done.current = true;
    refocus.current = viaKey;
    setEditing(false);
    // Committing the label unchanged (including the default label) is not an edit.
    if (value !== null && value.trim() !== (name || label)) renameLayer(trackId, value);
  };
  const onInputKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    // Enter that confirms an IME composition belongs to the IME.
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    // A held Enter/F2/Space that opened the editor auto-repeats into it: those repeats neither commit, cancel nor
    // type (a held Space would replace the selected name with spaces). Repeated Enter/Escape are always ignored.
    if (e.repeat && (openKeyHeld.current || e.key === 'Enter' || e.key === 'Escape')) {
      e.preventDefault();
      return;
    }
    openKeyHeld.current = false;
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(e.currentTarget.value, true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(null, true);
    }
  };
  const onNameKey = (e: KeyboardEvent<HTMLSpanElement>): void => {
    // Space edits only for keyboard users; after a mouse click Space stays play/pause, as on buttons.
    const space = e.key === ' ' && isKeyboardFocused(e.currentTarget);
    if (e.key === 'Enter' || e.key === 'F2' || space) {
      e.preventDefault();
      if (!e.repeat) start(true);
    }
  };

  if (editing) {
    return (
      <input
        className="track-name-input"
        data-testid="track-name-input"
        aria-label={`Name of ${label}`}
        defaultValue={name || label}
        maxLength={MAX_TRACK_NAME}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={onInputKey}
        onKeyUp={() => {
          openKeyHeld.current = false;
        }}
        onBlur={(e) => finish(e.currentTarget.value, false)}
      />
    );
  }
  return (
    <span
      ref={nameRef}
      className="track-name"
      data-testid="track-name"
      role="button"
      tabIndex={0}
      aria-label={`${label}, rename`}
      title={`${label} (double-click or Enter to rename)`}
      onDoubleClick={() => start(false)}
      onKeyDown={onNameKey}
    >
      {label}
    </span>
  );
}
