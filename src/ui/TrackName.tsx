import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Id } from '../core/model';
import { MAX_TRACK_NAME } from '../core/tracks';
import { isKeyboardFocused } from './inputModality';
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

  useEffect(() => {
    if (editing || !refocus.current) return;
    refocus.current = false;
    nameRef.current?.focus();
  }, [editing]);

  const start = (): void => {
    done.current = false;
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
      if (!e.repeat) start();
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
      onDoubleClick={start}
      onKeyDown={onNameKey}
    >
      {label}
    </span>
  );
}
