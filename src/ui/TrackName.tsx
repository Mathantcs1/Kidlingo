import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import type { Id } from '../core/model';
import { renameLayer } from './trackCommands';

interface TrackNameProps {
  trackId: Id;
  /** What is shown: the track's name, or its default label when it has none. */
  label: string;
  /** The stored name ('' when the default label is used). */
  name: string;
}

/** A track's name; double-click edits it in place (Enter or leaving the field commits once, Escape cancels). */
export default function TrackName({ trackId, label, name }: TrackNameProps) {
  const [editing, setEditing] = useState(false);
  const done = useRef(false);

  const finish = (value: string | null): void => {
    if (done.current) return;
    done.current = true;
    setEditing(false);
    // Committing the label unchanged (including the default label) is not an edit.
    if (value !== null && value.trim() !== (name || label)) renameLayer(trackId, value);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(e.currentTarget.value);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      finish(null);
    }
  };

  if (editing) {
    return (
      <input
        className="track-name-input"
        data-testid="track-name-input"
        aria-label={`Name of ${label}`}
        defaultValue={name || label}
        maxLength={60}
        autoFocus
        onFocus={(e) => e.currentTarget.select()}
        onKeyDown={onKeyDown}
        onBlur={(e) => finish(e.currentTarget.value)}
      />
    );
  }
  return (
    <span
      className="track-name"
      data-testid="track-name"
      title={`${label} (double-click to rename)`}
      onDoubleClick={() => {
        done.current = false;
        setEditing(true);
      }}
    >
      {label}
    </span>
  );
}
