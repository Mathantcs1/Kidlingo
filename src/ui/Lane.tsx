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
    setDrop(m && laneRejects(track.kind, m.kind) ? 'reject' : 'true');
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
  const clearSelection = (): void => {
    if (useEditor.getState().selection.length > 0) useEditor.getState().select([]);
  };

  return (
    <div
      className={`lane lane-${track.kind}${drop ? ` is-drop-${drop === 'true' ? 'target' : 'reject'}` : ''}`}
      data-testid="timeline-lane"
      data-track-id={track.id}
      data-track-kind={track.kind}
      data-drop-target={drop ?? undefined}
      aria-label={label}
      onClick={clearSelection}
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
          dragging={preview?.clipId === c.id}
          onDragStart={onDragStart}
        />
      ))}
      {preview?.trackId === track.id && (
        <div
          className={`clip-ghost${preview.kind === 'move' ? '' : ' is-trim'}`}
          data-testid="drag-ghost"
          style={{ left: timeToPx(preview.start, pps), width: timeToPx(preview.duration, pps) }}
        />
      )}
    </div>
  );
}
