// A draw's picture after its clip's effect stack (the compositor's per-clip effect step).
import type { Id, Project, VideoEffectType } from '../core/model';
import type { Draw } from './drawCollect';
import { EffectPipeline, effectWorkingSize, frameIndex, snapToFrame } from './effects/pipeline';
import type { EffectContext, LoadedLut } from './effects/types';
import { uvMatrix } from './gl';
import type { Mat3, Size, TextureSlot } from './gl';

const UPRIGHT = uvMatrix(0);

/**
 * The draw's picture after its effect stack: the original slot and uv when nothing applies. The result may be a
 * pipeline target that the NEXT clip's run of the same working size overwrites, so draw it before the next call.
 */
export function applyClipEffects(
  effects: EffectPipeline,
  d: Draw,
  p: Project,
  t: number,
  format: Size,
  luts: ReadonlyMap<Id, LoadedLut>,
  onUnavailable: (type: VideoEffectType) => void,
): { slot: TextureSlot; uv: Mat3 } {
  if (!d.clip.effects || d.clip.effects.length === 0) return d;
  const fps = p.format.fps;
  const ctx: EffectContext = {
    time: snapToFrame(t - d.clip.start, fps),
    frame: frameIndex(t - d.clip.start, fps),
    fps,
    lut: (ref) => luts.get(ref) ?? null,
    onUnavailable,
  };
  const slot = effects.run(d.slot, effectWorkingSize(d.size, d.texels, format), d.uv, d.clip.effects, ctx);
  // Effect results are upright and stored top row first, like an uploaded texture.
  return slot === d.slot ? d : { slot, uv: UPRIGHT };
}
