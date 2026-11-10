// Store-bound track commands for the timeline headers. Each change is ONE `apply` (one undo step), so playback
// pauses on it and undo restores it; refusals (TimelineError) become toasts.
import type { Id, Track, TrackKind } from '../core/model';
import { addTrack, moveTrack, removeTrack, renameTrack, setTrackFlags, trackLabel } from '../core/tracks';
import { useEditor } from '../state/store';
import { askConfirm } from './Confirm';
import { guard } from './Toast';
import { moveTarget } from './trackLayout';

export type TrackFlag = 'hidden' | 'muted' | 'solo' | 'locked';

const editor = () => useEditor.getState();

/** Adds a video layer (above the others) or an audio track (below the others) and makes it the active track. */
export function addLayer(kind: TrackKind): void {
  guard(() => {
    const before = new Set(editor().history.present.tracks.map((t) => t.id));
    editor().apply((p) => addTrack(p, kind));
    const added = editor().history.present.tracks.find((t) => !before.has(t.id));
    if (added) editor().setActiveTrack(added.id);
  });
}

/**
 * Removes a track. A track with clips is removed with its clips after the user confirms; refusals (last track of a
 * kind, locked) are reported before anything is asked.
 */
export async function removeLayer(trackId: Id): Promise<void> {
  const p = editor().history.present;
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) return;
  try {
    removeTrack(p, trackId, { removeClips: true }); // dry run: throws the refusal, if any
  } catch (err) {
    guard(() => {
      throw err;
    });
    return;
  }
  const n = track.clips.length;
  if (n > 0) {
    const label = trackLabel(p, trackId);
    const confirmed = await askConfirm({
      title: `Remove ${label} and its ${n === 1 ? '1 clip' : `${n} clips`}?`,
      message: `The track and ${n === 1 ? 'its clip are' : `its ${n} clips are`} removed from the timeline. Undo brings them back.`,
      confirmLabel: 'Remove',
    });
    if (!confirmed) return;
  }
  guard(() => editor().apply((q) => removeTrack(q, trackId, { removeClips: true })));
}

/** Swaps a track with its visual neighbour of the same kind; nothing at the edge. */
export function moveLayer(trackId: Id, direction: 'up' | 'down'): void {
  guard(() =>
    editor().apply((p) => {
      const to = moveTarget(p.tracks, trackId, direction);
      return to === null ? p : moveTrack(p, trackId, to);
    }),
  );
}

export function toggleTrackFlag(trackId: Id, flag: TrackFlag): void {
  guard(() =>
    editor().apply((p) => {
      const track: Track | undefined = p.tracks.find((t) => t.id === trackId);
      return track ? setTrackFlags(p, trackId, { [flag]: !track[flag] }) : p;
    }),
  );
}

/** An empty name falls back to the default label ("Video 2"). */
export function renameLayer(trackId: Id, name: string): void {
  guard(() => editor().apply((p) => renameTrack(p, trackId, name)));
}
