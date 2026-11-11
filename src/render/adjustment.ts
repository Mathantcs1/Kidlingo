// Adjustment layers in the compositor (Plan 4 Task 13a). Ruling P2: they reuse the ONE CompositeBuffer of Task 11a:
// everything drawn before the adjustment clip (the layers beneath, in array order) is the composite so far; its effect
// stack runs over that, and the result is blended back with the clip's blend mode and opacity. Drawing then continues
// with the layers above, into the new composite.
import type { Clip, Id, Project, VideoEffectType } from '../core/model';
import { blendOf, clipEffectContext } from './clipEffects';
import { COMPOSITE_UV } from './compositeBuffer';
import type { CompositeBuffer } from './compositeBuffer';
import { isAdjustmentDraw } from './drawCollect';
import type { FrameDraw } from './drawCollect';
import { EffectPipeline, workingSize } from './effects/pipeline';
import type { LoadedLut } from './effects/types';
import type { Size } from './gl';

/** An adjustment clip changes the picture only when it has an enabled effect (blend and opacity act on its result). */
export function adjustmentApplies(clip: Clip): boolean {
  return (clip.effects ?? []).some((e) => e.enabled);
}

/** Whether a frame step needs the intermediate composite: a non-normal blend mode, or an adjustment that applies. */
export function needsComposite(d: FrameDraw): boolean {
  return isAdjustmentDraw(d) ? adjustmentApplies(d.clip) : blendOf(d.clip) !== 'normal';
}

/**
 * Runs `clip`'s effects over the composite so far (read upright through COMPOSITE_UV, at the composite's size capped
 * like any working size) and IMMEDIATELY blends the result back (a pipeline output is overwritten by the next run of
 * its size). When nothing applies the pipeline returns the composite itself: no blend then (blend must never read
 * the target it writes). Returns whether a blend pass was drawn. The new composite stays bound.
 */
export function applyAdjustment(
  composite: CompositeBuffer,
  effects: EffectPipeline,
  clip: Clip,
  p: Project,
  t: number,
  format: Size,
  luts: ReadonlyMap<Id, LoadedLut>,
  onUnavailable: (type: VideoEffectType) => void,
): boolean {
  if (!adjustmentApplies(clip)) return false;
  const backdrop = composite.currentSlot();
  const ctx = clipEffectContext(clip, p, t, luts, onUnavailable);
  const out = effects.run(backdrop, workingSize(composite.size, format), COMPOSITE_UV, clip.effects, ctx);
  if (out === backdrop) return false;
  composite.blend(blendOf(clip), clip.transform.opacity, { tex: out.tex, uv: COMPOSITE_UV });
  return true;
}
