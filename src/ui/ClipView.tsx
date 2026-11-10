import type { MouseEvent, PointerEvent } from 'react';
import { clipDuration } from '../core/model';
import type { Clip, Id, MediaRef } from '../core/model';
import { useEditor } from '../state/store';
import { toggleSelection } from './edits';
import { timeToPx } from './layout';
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
  const name = media?.name ?? 'Unknown media';
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
      <span className="clip-name">{name}</span>
      {missing && <span className="clip-missing">missing media</span>}
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
