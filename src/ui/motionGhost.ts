// The ghost of a preset-moved picture (Plan 5B D3, Ruling P5B-7). Fields and handles edit the REST (base) transform,
// so while a preset moves the picture away from it, the canvas shows a faint outline where the picture is actually
// drawn (`motion-ghost`), and that drawn quad is a hit region for SELECTION only (drags still edit the rest transform).
// Pure and DOM-free; both read the resolver (resolveClip = drawn, resolvedTransform = base), never the stack itself.
import { motionAt } from '../core/motion';
import { resolveClip, resolvedTransform } from '../core/animate';
import type { Clip, Id, Project, Transform } from '../core/model';
import { clipCorners } from '../render/overlayGeometry';
import type { Corners, Point } from '../render/overlayGeometry';
import { visualClipsAt } from '../render/visible';
import { sourceSizeFor } from './overlayMath';

const sameGeometry = (a: Transform, b: Transform): boolean =>
  a.x === b.x && a.y === b.y && a.scale === b.scale && a.rotation === b.rotation;

/** The drawn transform of `clip` at `t` when its preset stack moves it away from the rest geometry, else null. */
function drawnAway(p: Project, clip: Clip, t: number): Transform | null {
  if (!motionAt(clip, t, p.format)) return null;
  if (t < clip.start || t >= clip.start + (clip.out - clip.in)) return null;
  const drawn = resolveClip(clip, t, p.format).transform;
  return sameGeometry(drawn, resolvedTransform(clip, t, p.format.fps)) ? null : drawn;
}

/**
 * The quad (format px) where `clip` is drawn at timeline time `t`, when presets draw it somewhere other than its rest
 * quad (offset, scaled or turned; a fade alone draws on the handles); null otherwise, off the clip, and for clips with
 * no picture size (audio, adjustment layers).
 */
export function motionGhost(p: Project, clip: Clip, t: number): Corners | null {
  const size = sourceSizeFor(clip, p.media[clip.mediaId], undefined, p.format);
  if (!size) return null;
  const drawn = drawnAway(p, clip, t);
  return drawn ? clipCorners(size, drawn, p.format) : null;
}

/** Whether `pt` lies inside the convex quad `q` (either winding); false for a degenerate quad. */
export function pointInQuad(q: readonly Point[], pt: Point): boolean {
  let sign = 0;
  for (let i = 0; i < q.length; i++) {
    const a = q[i];
    const b = q[(i + 1) % q.length];
    const cross = (b.x - a.x) * (pt.y - a.y) - (b.y - a.y) * (pt.x - a.x);
    if (cross === 0) continue;
    const s = cross > 0 ? 1 : -1;
    if (sign === 0) sign = s;
    else if (s !== sign) return false;
  }
  return sign !== 0;
}

/**
 * The topmost visible clip whose ghost (drawn quad, visible: opacity and scale above 0) contains format point `pt` at
 * timeline time `t`, or null. Static pictures are not hit here: the canvas only selects through ghosts.
 */
export function ghostHitAt(p: Project, t: number, pt: Point): Id | null {
  const clips = visualClipsAt(p, t);
  for (let i = clips.length - 1; i >= 0; i--) {
    const clip = clips[i];
    const size = sourceSizeFor(clip, p.media[clip.mediaId], undefined, p.format);
    const drawn = size ? drawnAway(p, clip, t) : null;
    if (!size || !drawn || !(drawn.opacity > 0) || !(drawn.scale > 0)) continue;
    if (pointInQuad(clipCorners(size, drawn, p.format), pt)) return clip.id;
  }
  return null;
}
