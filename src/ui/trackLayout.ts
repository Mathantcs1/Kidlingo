// Pure, DOM-free layout of the timeline's track rows: visual order, row heights and layer moves.
import type { Id, Track, TrackKind } from '../core/model';

/** Width of the track header column, px. */
export const HEADER_WIDTH = 232;

/**
 * Tracks top to bottom as the timeline shows them: video tracks highest layer first (reverse array order, since
 * array index 0 is the bottom layer), then audio tracks in array order.
 */
export function displayOrder(tracks: Track[]): Track[] {
  const video = tracks.filter((t) => t.kind === 'video').reverse();
  return [...video, ...tracks.filter((t) => t.kind === 'audio')];
}

/** Row height in px. */
export function trackHeight(kind: TrackKind): number {
  return kind === 'video' ? 56 : 40;
}

/**
 * The array index to pass to `moveTrack` so that the track swaps with its visual neighbour of the same kind (video
 * 'up' = the next higher layer = higher array index; audio 'up' = lower array index), or null at the edge.
 */
export function moveTarget(tracks: Track[], trackId: Id, direction: 'up' | 'down'): number | null {
  const track = tracks.find((t) => t.id === trackId);
  if (!track) return null;
  const sameKind = tracks.map((t, i) => (t.kind === track.kind ? i : -1)).filter((i) => i >= 0);
  const k = sameKind.indexOf(tracks.indexOf(track));
  const higherIndex = (track.kind === 'video') === (direction === 'up');
  return sameKind[higherIndex ? k + 1 : k - 1] ?? null;
}
