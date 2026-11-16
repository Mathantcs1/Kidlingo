// Phase 2 of a frame (split out of compositor.ts, Plan 5C Task 1): draws the collected steps in track order onto the canvas
// or, when the frame needs it, the composite buffer (blend modes, adjustment layers).
import type { BlendMode, Id, Project, VideoEffectType } from '../core/model';
import { applyAdjustment } from './adjustment';
import type { BlurBackground } from './blur';
import { applyClipEffects, blendOf } from './clipEffects';
import type { CompositeBuffer } from './compositeBuffer';
import { isAdjustmentDraw, isTransitionDraw } from './drawCollect';
import type { Draw, FrameDraw } from './drawCollect';
import type { TransitionDraw } from './drawCollectTransition';
import { bindCanvas, drawPicture } from './drawPicture';
import type { EffectPipeline } from './effects/pipeline';
import type { LoadedLut } from './effects/types';
import type { QuadRenderer, Rect, Size } from './gl';
import type { TransitionParams } from './transitionMath';
import type { TransitionProgram } from './transitionPass';

/** What drawing a frame needs from the compositor. */
export interface StepDeps {
  gl: WebGL2RenderingContext;
  quad: QuadRenderer;
  blur: BlurBackground;
  composite: CompositeBuffer;
  effects: EffectPipeline;
  luts: Map<Id, LoadedLut>;
  onUnavailable: (type: VideoEffectType) => void;
  /** The transition program, compiled on first use; null when it cannot be (a transition then cuts at its midpoint). */
  transitionProgram: () => TransitionProgram | null;
}

/** The pixel parameters of a transition draw (defaults per type). */
export function transitionParams(d: TransitionDraw): TransitionParams {
  const tr = d.transition;
  return {
    type: tr.type, e: d.e, direction: tr.direction ?? 'left', softness: tr.softness ?? 0.05,
    amount: tr.amount ?? (tr.type === 'zoom' ? 2 : 0.5), frame: d.frame,
  };
}

/** The blend mode a transition's picture is composited with: the clips' own when they agree, else the outgoing one's before the midpoint and the incoming one's after (D8). */
export function transitionMode(d: TransitionDraw): BlendMode {
  const a = d.a ? blendOf(d.a.clip) : 'normal';
  const b = d.b ? blendOf(d.b.clip) : 'normal';
  return a === b || d.e < 0.5 ? a : b;
}

/** `composite` is true when the frame draws through the composite buffer (it has begun); false draws straight to the canvas. */
export function drawSteps(deps: StepDeps, draws: FrameDraw[], p: Project, t: number, format: Size, viewport: Rect, composite: boolean): void {
  const { gl } = deps;
  const bindOutput = composite ? () => deps.composite.bindCurrent() : () => bindCanvas(gl, viewport);
  bindOutput();
  /** One picture drawn into the bound output (effects first, then the blend layer when it is not Normal). */
  const drawPlain = (d: Draw): void => {
    // Effects first (working-size passes, no transform); the blur backdrop is made from the processed picture (D7).
    // A pipeline output is overwritten by the next clip's run of its size: it is drawn right here.
    const { slot, uv } = applyClipEffects(deps.effects, d, p, t, format, deps.luts, deps.onUnavailable);
    const mode = blendOf(d.clip);
    if (!composite || mode === 'normal') {
      drawPicture(deps.quad, deps.blur, d, slot, uv, format, viewport, bindOutput);
      return;
    }
    deps.composite.beginLayer();
    drawPicture(deps.quad, deps.blur, d, slot, uv, format, viewport, () => deps.composite.bindLayer());
    deps.composite.blend(mode);
  };
  /** One clip of a transition into its own full-frame layer target (cleared; transparent when the clip has no picture). */
  const drawLayer = (d: Draw | null, begin: () => void, bind: () => void): void => {
    begin();
    if (!d) return;
    const { slot, uv } = applyClipEffects(deps.effects, d, p, t, format, deps.luts, deps.onUnavailable);
    drawPicture(deps.quad, deps.blur, d, slot, uv, format, viewport, bind);
  };
  const drawTransition = (d: TransitionDraw): void => {
    const program = composite ? deps.transitionProgram() : null;
    if (!program) {
      // No composite or no transition program: a hard cut at the midpoint (the incoming picture from u = 0.5).
      const side = d.u < 0.5 ? d.a : d.b;
      if (side) drawPlain(side);
      return;
    }
    drawLayer(d.a, () => deps.composite.beginLayer(), () => deps.composite.bindLayer());
    drawLayer(d.b, () => deps.composite.beginLayerB(), () => deps.composite.bindLayerB());
    const { a, b } = deps.composite.layerTextures();
    const prm = transitionParams(d);
    const mode = transitionMode(d);
    if (mode === 'normal') deps.composite.into((backdrop) => program.draw(prm, a, b, backdrop));
    else deps.composite.viaScratch(mode, () => program.draw(prm, a, b, null));
  };
  for (const d of draws) {
    if (isAdjustmentDraw(d)) {
      // Everything drawn so far is the composite (or no composite: blending unavailable, the adjustment is skipped).
      if (composite) applyAdjustment(deps.composite, deps.effects, d.clip, p, t, format, deps.luts, deps.onUnavailable);
    } else if (isTransitionDraw(d)) drawTransition(d);
    else drawPlain(d);
  }
}
