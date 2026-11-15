// Phase 2 of a frame (split out of compositor.ts, Plan 5C Task 1): draws the collected steps in track order onto the canvas
// or, when the frame needs it, the composite buffer (blend modes, adjustment layers).
import type { Id, Project, VideoEffectType } from '../core/model';
import { applyAdjustment } from './adjustment';
import type { BlurBackground } from './blur';
import { applyClipEffects, blendOf } from './clipEffects';
import type { CompositeBuffer } from './compositeBuffer';
import { isAdjustmentDraw } from './drawCollect';
import type { FrameDraw } from './drawCollect';
import { bindCanvas, drawPicture } from './drawPicture';
import type { EffectPipeline } from './effects/pipeline';
import type { LoadedLut } from './effects/types';
import type { QuadRenderer, Rect, Size } from './gl';

/** What drawing a frame needs from the compositor. */
export interface StepDeps {
  gl: WebGL2RenderingContext;
  quad: QuadRenderer;
  blur: BlurBackground;
  composite: CompositeBuffer;
  effects: EffectPipeline;
  luts: Map<Id, LoadedLut>;
  onUnavailable: (type: VideoEffectType) => void;
}

/** `composite` is true when the frame draws through the composite buffer (it has begun); false draws straight to the canvas. */
export function drawSteps(deps: StepDeps, draws: FrameDraw[], p: Project, t: number, format: Size, viewport: Rect, composite: boolean): void {
  const { gl } = deps;
    const bindOutput = composite ? () => deps.composite.bindCurrent() : () => bindCanvas(gl, viewport);
    bindOutput();
    for (const d of draws) {
      if (isAdjustmentDraw(d)) {
        // Everything drawn so far is the composite (or no composite: blending unavailable, the adjustment is skipped).
        if (composite) applyAdjustment(deps.composite, deps.effects, d.clip, p, t, format, deps.luts, deps.onUnavailable);
        continue;
      }
      // Effects first (working-size passes, no transform); the blur backdrop is made from the processed picture (D7).
      // A pipeline output is overwritten by the next clip's run of its size: it is drawn right here.
      const { slot, uv } = applyClipEffects(deps.effects, d, p, t, format, deps.luts, deps.onUnavailable);
      const mode = blendOf(d.clip);
      if (!composite || mode === 'normal') {
        drawPicture(deps.quad, deps.blur, d, slot, uv, format, viewport, bindOutput);
        continue;
      }
      deps.composite.beginLayer();
      drawPicture(deps.quad, deps.blur, d, slot, uv, format, viewport, () => deps.composite.bindLayer());
      deps.composite.blend(mode);
    }
}
