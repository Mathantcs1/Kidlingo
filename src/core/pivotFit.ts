// A fit placement for a clip with a static pivot (Plan 5E review wave): (x, y) is where the PIVOT lands, so putting the
// picture back in the frame means offsetting the pivot by R·(anchor · size · scale) from the canvas centre.
import type { Anchor } from './cropTypes';
import type { Transform } from './model';

/** `fit` (position, scale from a fit mode) moved so the clip's FRAME CENTRE, not its pivot, sits where `fit` puts it; `rotation` is the clip's rotation after the fit. */
export function withPivotOffset(fit: Transform, anchor: Anchor | undefined, src: { width: number; height: number }, rotation: number): Transform {
  if (!anchor || (anchor.x === 0 && anchor.y === 0)) return fit;
  const ax = anchor.x * src.width * fit.scale;
  const ay = anchor.y * src.height * fit.scale;
  const rad = (rotation * Math.PI) / 180;
  return { ...fit, x: fit.x + ax * Math.cos(rad) - ay * Math.sin(rad) + 0, y: fit.y + ax * Math.sin(rad) + ay * Math.cos(rad) + 0 };
}
