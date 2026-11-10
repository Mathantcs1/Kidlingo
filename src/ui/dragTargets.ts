// What a dragged clip is over: a lane of its kind or a new-layer zone (DOM hit testing for useClipDrag).
import type { Id, TrackKind } from '../core/model';

/**
 * `lane`/`zone`: a drop target. `blocked`: the sticky ruler or header column, painted over the rows that scroll
 * beneath them, so nothing can be dropped there.
 */
export type DropTarget = { lane: Id; zone?: undefined } | { zone: TrackKind; lane?: undefined } | 'blocked';

const TARGETS = '[data-testid="timeline-lane"], [data-testid="new-layer-zone"]';

/**
 * Only the topmost element at a page point counts (never a lane or zone scrolled under the ruler or the header
 * column): the lane holding `kind` clips or the new-layer zone (of either kind: the wrong one shows a rejected ghost)
 * it belongs to; `blocked` over the ruler/headers; null elsewhere (a lane of the other kind, or outside the rows).
 */
export function dropTargetAt(x: number, y: number, kind: TrackKind): DropTarget | null {
  const top = document.elementFromPoint(x, y);
  if (!(top instanceof Element)) return null;
  if (top.closest('.ruler, .track-headers')) return 'blocked';
  const el = top.closest<HTMLElement>(TARGETS);
  if (!el) return null;
  const { testid, trackKind, trackId, kind: zone } = el.dataset;
  if (testid === 'timeline-lane') return trackKind === kind && trackId ? { lane: trackId } : null;
  return zone === 'video' || zone === 'audio' ? { zone } : null;
}
