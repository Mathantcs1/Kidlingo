// The frame-mode edit (split out of edits.ts, Plan 5D Task 1). edits.ts re-exports it, so existing imports keep working.
import { fitTransform } from '../core/merge';
import { withPivotOffset } from '../core/pivotFit';
import type { Clip, Id, Project } from '../core/model';
import { TimelineError } from '../core/timeline';
import { withoutTransformKeys } from '../core/transformEdits';
import { updateClip } from './edits';

/**
 * Sets a video/image clip's fit mode and resets its position and scale to `fitTransform` for the project canvas (the
 * modes are defined by how the whole clip covers the canvas) and removes its position and scale keys; rotation and
 * opacity (and their keys) are kept. Media without known dimensions only changes the mode. Returns `p` itself when
 * the clip already has that mode.
 */
export function setClipFit(p: Project, clipId: Id, fit: Clip['fit']): Project {
  return updateClip(p, clipId, (c) => {
    if (c.kind === 'audio') throw new TimelineError('Audio clips have no picture to fit');
    if (c.kind === 'overlay') throw new TimelineError('Overlays have no frame to fit');
    if (c.kind === 'adjustment') throw new TimelineError('Adjustment layers have no frame to fit');
    if (c.fit === fit) return c;
    const m = p.media[c.mediaId];
    if (!m?.width || !m.height) return { ...c, fit };
    const src = { width: m.width, height: m.height };
    // A static pivot moves the position so the PICTURE (not the pivot) takes the fit framing (5E).
    const transform = { ...withPivotOffset(fitTransform(src, p.format, fit), c.anchor, src, c.transform.rotation), rotation: c.transform.rotation, opacity: c.transform.opacity };
    // The fit defines the framing: position and scale keys go (Plan 5 D9); rotation and opacity keys stay.
    const { keys: _keys, ...rest } = c;
    const keys = withoutTransformKeys(c.keys, ['position', 'scale']);
    return keys ? { ...rest, fit, transform, keys } : { ...rest, fit, transform };
  });
}
