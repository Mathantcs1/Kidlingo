import type { Clip, Id, Project } from '../core/model';
import type { VideoSource } from '../media/decode';
import { uvMatrix } from './gl';
import type { Mat3, Size, TextureSlot } from './gl';
import { pruneVideoSlots } from './drawCollectPicture';
import type { ImageTextures } from './images';
import type { OverlayTextures } from './overlays/textures';
import { clipDraw, transitionDraw } from './drawCollectTransition';
import type { TransitionDraw } from './drawCollectTransition';
import { frameStepsAt, isTransitionStep } from './visible';

export interface Draw {
  /** The clip as seen at the frame's time (resolveClip): evaluated transform and effect params, no keys. */
  clip: Clip;
  slot: TextureSlot;
  /** Displayed (rotated) size in source pixels. */
  size: Size;
  /** Quad → texture coordinates (applies the source's display rotation). */
  uv: Mat3;
  /** The texture's resolution in display orientation (an image may be decoded smaller than `size`). */
  texels: Size;
}

/** An adjustment clip's place in the draw order: no picture of its own (see render/adjustment.ts). */
export interface AdjustmentDraw {
  /** Resolved like Draw.clip. */
  clip: Clip;
  adjustment: true;
}

/** One step of a frame, bottom first: a picture to draw, or an adjustment applied to everything below it. */
export type FrameDraw = Draw | AdjustmentDraw | TransitionDraw;

/** A step the compositor draws directly (a transition is expanded first). */
export type PlainDraw = Draw | AdjustmentDraw;

export const isAdjustmentDraw = (d: FrameDraw): d is AdjustmentDraw => 'adjustment' in d;
export const isTransitionDraw = (d: FrameDraw): d is TransitionDraw => 'transition' in d;

/** What Phase 1 needs from the compositor. */
export interface DrawContext {
  gl: WebGL2RenderingContext;
  images: ImageTextures;
  overlays: OverlayTextures;
  /** Output px per format px for the current canvas (overlays are drawn at the size they are shown at). */
  pixelScale(format: Size): number;
  /** Textures per video source; a source used by several clips in one frame gets one texture per use. */
  videoSlots: Map<VideoSource, TextureSlot[]>;
  /** Throws when the compositor is disposed or the context is lost. */
  assertUsable(): void;
  /** True while the compositor may still upload (not disposed, context not lost). */
  isLive(): boolean;
}

export const UPRIGHT = uvMatrix(0);

/**
 * Phase 1 (async): fetch every frame/bitmap and upload it into its own texture. Nothing is drawn to the
 * canvas, so the browser can never present a half-composited frame while we wait on decoders. Each visible clip is
 * resolved ONCE here (Plan 5 D7): every draw carries the clip as seen at `t` (static clips: the stored object itself),
 * so nothing after this reads keys. Hidden tracks are filtered out before resolution.
 */
export async function collectDraws(ctx: DrawContext, p: Project, t: number, sources: Map<Id, VideoSource>): Promise<FrameDraw[]> {
  const draws: FrameDraw[] = [];
  const state = { uses: new Map<VideoSource, number>(), shownImages: new Set<Id>(), shownOverlays: new Set<Id>() };
  ctx.overlays.beginFrame();
  for (const step of frameStepsAt(p, t)) {
    if (isTransitionStep(step)) {
      const d = await transitionDraw(ctx, p, step, t, sources, state);
      if (d) draws.push(d);
      continue;
    }
    const d = await clipDraw(ctx, p, step.clip, t, t, sources, state);
    if (d) draws.push(d);
  }
  pruneVideoSlots(ctx, sources);
  ctx.images.prune(state.shownImages, p);
  ctx.overlays.prune(state.shownOverlays);
  return draws;
}
