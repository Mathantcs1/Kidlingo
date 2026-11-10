import { useState } from 'react';
import type { DragEvent } from 'react';
import type { Project, TrackKind } from '../core/model';
import { MAX_TRACKS_PER_KIND } from '../core/tracks';
import { dropStart, laneRejects } from './drag';
import { timeToPx } from './layout';
import { MEDIA_MIME, draggedMedia, isMediaDrag, setDraggedMedia } from './mediaDrag';
import { dropOnNewLayer } from './trackCommands';
import type { DragPreview } from './useClipDrag';

/** Height of a new-layer zone row, px (the header column has a spacer of the same height). */
export const ZONE_HEIGHT = 28;

interface NewLayerZoneProps {
  kind: TrackKind;
  project: Project;
  pps: number;
  /** The clip drag in progress, if any: its ghost is shown here while it is over this zone. */
  preview: DragPreview | null;
}

const NAMES: Record<TrackKind, string> = { video: 'video layer', audio: 'audio track' };

/**
 * A slim drop target that creates a new track: above the top video lane (a new top layer) or below the bottom audio
 * lane. Media from the bin (HTML5 drag) and clips (pointer drag, see useClipDrag) can be dropped on it. Not focusable:
 * the toolbar's add buttons and "Add to timeline" are the keyboard path.
 */
export default function NewLayerZone({ kind, project, pps, preview }: NewLayerZoneProps) {
  const [drop, setDrop] = useState<'true' | 'reject' | null>(null);
  const full = project.tracks.filter((t) => t.kind === kind).length >= MAX_TRACKS_PER_KIND;

  const onDragOver = (e: DragEvent<HTMLDivElement>): void => {
    if (!isMediaDrag(e)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    const m = project.media[draggedMedia() ?? ''];
    setDrop(full || (m && laneRejects(kind, m.kind)) ? 'reject' : 'true');
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
    const m = project.media[id];
    // A refused drop (kind, limit) still goes through the command, which reports why as a toast.
    dropOnNewLayer(kind, id, m ? dropStart(project, x, pps, m.duration) : 0);
  };

  const ghost = preview?.zone === kind ? preview : null;
  const state = drop ?? (ghost ? (ghost.rejected ? 'reject' : 'true') : null);
  const classes = ['new-layer-zone', `new-layer-zone-${kind}`];
  if (state) classes.push(state === 'true' ? 'is-drop-target' : 'is-drop-reject');

  return (
    <div
      className={classes.join(' ')}
      style={{ height: ZONE_HEIGHT }}
      data-testid="new-layer-zone"
      data-kind={kind}
      data-drop-target={state ?? undefined}
      role="group"
      aria-label={`Drop here for a new ${NAMES[kind]}`}
      onDragEnter={onDragOver}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <span className="new-layer-zone-label" aria-hidden="true">
        {full ? `At most ${MAX_TRACKS_PER_KIND} ${kind} tracks` : 'Drop here for a new layer'}
      </span>
      {ghost && (
        <div
          className={`clip-ghost${ghost.rejected ? ' is-reject' : ''}`}
          data-testid="drag-ghost"
          style={{ left: timeToPx(ghost.start, pps), width: timeToPx(ghost.duration, pps) }}
        />
      )}
    </div>
  );
}
