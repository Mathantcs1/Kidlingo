import { useState } from 'react';
import type { DragEvent, PointerEvent } from 'react';
import type { Id, Project, Track } from '../core/model';
import { useEditor } from '../state/store';
import ClipView from './ClipView';
import { dropStart, laneRejects } from './drag';
import { dropMedia } from './edits';
import { timeToPx } from './layout';
import { MEDIA_MIME, draggedMedia, setDraggedMedia } from './mediaDrag';
import { guard } from './Toast';
import { trackHeight } from './trackLayout';
import type { DragKind, DragPreview } from './useClipDrag';

interface LaneProps {
  project: Project;
  track: Track;
  label: string;
  pps: number;
  selected: Set<Id>;
  preview: DragPreview | null;
  onDragStart(e: PointerEvent<HTMLElement>, clipId: Id, kind: DragKind): void;
}

const isMediaDrag = (e: DragEvent): boolean => e.dataTransfer.types.includes(MEDIA_MIME) || draggedMedia() !== null;

/** One timeline track: its clips, the live drag ghost, and the drop target for media from the bin. */
export default function Lane({ project, track, label, pps, selected, preview, onDragStart }: LaneProps) {
  const [drop, setDrop] = useState<'true' | 'reject' | null>(null);

  const onDragOver = (e: DragEvent<HTMLDivElement>): void => {
    if (!isMediaDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const m = project.media[draggedMedia() ?? ''];
    setDrop(track.locked || (m && laneRejects(track.kind, m.kind)) ? 'reject' : 'true');
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>): void => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>): void => {
    if (!isMediaDrag(e)) return;
    e.preventDefault();
    setDrop(null);
    const id = e.dataTransfer.getData(MEDIA_MIME) || draggedMedia();
    setDraggedMedia(null);
    if (!id) return;
    const x = e.clientX - e.currentTarget.getBoundingClientRect().left;
    guard(() =>
      useEditor.getState().apply((p) => {
        const m = p.media[id];
        return dropMedia(p, track.id, id, m ? dropStart(p, x, pps, m.duration) : 0);
      }),
    );
  };
  /** A click on the lane background clears the clip selection and makes this the active track. */
  const onClick = (): void => {
    const { selection, select, setActiveTrack } = useEditor.getState();
    if (selection.length > 0) select([]);
    setActiveTrack(track.id);
  };
  const classes = ['lane', `lane-${track.kind}`];
  if (drop) classes.push(drop === 'true' ? 'is-drop-target' : 'is-drop-reject');
  if (track.locked) classes.push('is-locked');
  if (track.hidden) classes.push('is-hidden');

  return (
    <div
      className={classes.join(' ')}
      style={{ height: trackHeight(track.kind) }}
      data-testid="timeline-lane"
      data-track-id={track.id}
      data-track-kind={track.kind}
      data-drop-target={drop ?? undefined}
      aria-label={track.locked ? `${label} (locked)` : label}
      onClick={onClick}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {track.clips.map((c) => (
        <ClipView
          key={c.id}
          clip={c}
          media={project.media[c.mediaId]}
          pps={pps}
          selected={selected.has(c.id)}
          locked={track.locked}
          dragging={preview?.clipId === c.id}
          onDragStart={onDragStart}
        />
      ))}
      {preview?.trackId === track.id && (
        <div
          className={`clip-ghost${preview.kind === 'move' ? '' : ' is-trim'}${preview.rejected ? ' is-reject' : ''}`}
          data-testid="drag-ghost"
          style={{ left: timeToPx(preview.start, pps), width: timeToPx(preview.duration, pps) }}
        />
      )}
    </div>
  );
}
