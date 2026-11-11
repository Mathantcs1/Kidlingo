import type { MouseEvent, PointerEvent } from 'react';
import { clipDuration } from '../core/model';
import { overlayLabel } from '../core/overlays';
import type { Clip, Id, MediaRef } from '../core/model';
import { useEditor } from '../state/store';
import './audio.css';
import { toggleSelection } from './edits';
import { timeToPx } from './layout';
import Waveform from './Waveform';
import type { DragKind } from './useClipDrag';

interface ClipViewProps {
  clip: Clip;
  media: MediaRef | undefined;
  pps: number;
  selected: boolean;
  /** On a locked track: shown dimmed; edits are refused by the core with a toast. */
  locked: boolean;
  dragging: boolean;
  onDragStart(e: PointerEvent<HTMLElement>, clipId: Id, kind: DragKind): void;
}

/** A clip on a lane: click selects, the body drags to move, the edge handles drag to trim. */
export default function ClipView({ clip, media, pps, selected, locked, dragging, onDragStart }: ClipViewProps) {
  const missing = media?.missing === true;
  // Overlay clips have no media (Task 13 gives them their own look).
  const name = clip.kind === 'overlay' ? overlayLabel(clip) : media?.name ?? 'Unknown media';
  const onClick = (e: MouseEvent): void => {
    e.stopPropagation();
    const { selection, select } = useEditor.getState();
    select(toggleSelection(selection, clip.id, e.shiftKey || e.metaKey || e.ctrlKey));
  };
  const classes = ['clip', `clip-${clip.kind}`];
  if (selected) classes.push('is-selected');
  if (missing) classes.push('is-missing');
  if (dragging) classes.push('is-dragging');
  if (locked) classes.push('is-locked');
  return (
    <button
      type="button"
      className={classes.join(' ')}
      style={{ left: timeToPx(clip.start, pps), width: timeToPx(clipDuration(clip), pps) }}
      data-testid="timeline-clip"
      data-clip-id={clip.id}
      data-selected={String(selected)}
      data-missing={missing ? 'true' : undefined}
      aria-pressed={selected}
      title={missing ? `${name} (missing media)` : name}
      onClick={onClick}
      onPointerDown={(e) => onDragStart(e, clip.id, 'move')}
    >
      {media && !missing && (clip.kind === 'audio' || (clip.kind === 'video' && media.hasAudio && !clip.audio.silent)) && (
        <Waveform clip={clip} mediaId={clip.mediaId} width={timeToPx(clipDuration(clip), pps)} />
      )}
      <span className="clip-name">{name}</span>
      {missing && <span className="clip-missing">missing media</span>}
      {clip.kind === 'video' && clip.audio.silent && (
        <span className="clip-detached-badge" data-testid="clip-detached-badge">
          audio detached
        </span>
      )}
      <span
        className="trim-handle trim-start"
        data-testid="trim-start"
        aria-hidden="true"
        onPointerDown={(e) => onDragStart(e, clip.id, 'start')}
      />
      <span
        className="trim-handle trim-end"
        data-testid="trim-end"
        aria-hidden="true"
        onPointerDown={(e) => onDragStart(e, clip.id, 'end')}
      />
    </button>
  );
}
