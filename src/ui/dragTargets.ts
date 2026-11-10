// What a dragged clip is over: a lane of its kind or a new-layer zone (DOM hit testing for useClipDrag).
import type { Id, TrackKind } from '../core/model';

export type DropTarget = { lane: Id; zone?: undefined } | { zone: TrackKind; lane?: undefined };

/**
 * The lane holding `kind` clips, or the new-layer zone (of either kind: the wrong one shows a rejected ghost), under a
 * page point. A lane of the other kind, or nothing, gives null.
 */
export function dropTargetAt(x: number, y: number, kind: TrackKind): DropTarget | null {
  for (const el of document.elementsFromPoint(x, y)) {
    if (!(el instanceof HTMLElement)) continue;
    const { testid, trackKind, trackId, kind: zone } = el.dataset;
    if (testid === 'timeline-lane') return trackKind === kind && trackId ? { lane: trackId } : null;
    if (testid === 'new-layer-zone') return zone === 'video' || zone === 'audio' ? { zone } : null;
  }
  return null;
}
