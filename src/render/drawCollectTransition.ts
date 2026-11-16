// Phase 1 for transitions (Plan 5C Task 4): the draws of the two clips of an open window. A clip drawn in its handle (the
// incoming one before its start, the outgoing one after its end) reads its footage through the 5D time map, but everything
// the resolver evaluates (keys, loops, presets, effect params) is held at the clip's EDGE frame (D10); the effect time bases
// keep running because the compositor passes the project time to them.
import { resolveClip } from '../core/animate';
import { clipEnd } from '../core/clipTime';
import { maxDrawnScale } from '../core/drawnScale';
import { easeAt } from '../core/easing';
import { frameIndex } from '../core/fps';
import type { Clip, Id, Project } from '../core/model';
import type { Transition } from '../core/transitionTypes';
import type { VideoSource } from '../media/decode';
import { imageDraw, videoDraw } from './drawCollectPicture';
import { UPRIGHT } from './drawCollect';
import type { Draw, DrawContext, FrameDraw } from './drawCollect';

/** The two pictures of a transition step and its progress: `u` raw through the window, `e` eased (D4). */
export interface TransitionDraw {
  transition: Transition;
  /** The outgoing clip's draw (null when it has no frame there). */
  a: Draw | null;
  /** The incoming clip's draw. */
  b: Draw | null;
  u: number;
  e: number;
  /** The project frame index of the frame (the glitch hash seed). */
  frame: number;
  /** Both clips as resolved, for what needs them (LUT preload). */
  clip: Clip;
}

/** Per-frame bookkeeping shared by the draws of one frame. */
export interface CollectState {
  uses: Map<VideoSource, number>;
  shownImages: Set<Id>;
  shownOverlays: Set<Id>;
}

/** The time a clip is resolved at: `t` clamped to the clip's own frames (its last frame is one frame before its end). */
export function edgeTime(clip: Clip, t: number, fps: number): number {
  return Math.min(Math.max(t, clip.start), Math.max(clip.start, clipEnd(clip) - 1 / fps));
}

/**
 * One clip's draw at timeline time `t`, resolved (keys, presets) at `te`; null when there is nothing to draw (unknown media,
 * no frame). Adjustment clips come back as an AdjustmentDraw.
 */
export async function clipDraw(
  ctx: DrawContext, p: Project, raw: Clip, t: number, te: number, sources: Map<Id, VideoSource>, state: CollectState,
): Promise<FrameDraw | null> {
  const clip = resolveClip(raw, te, p.format);
  if (clip.kind === 'adjustment') return { clip, adjustment: true };
  if (clip.kind === 'overlay') {
    // No media: drawn with Canvas2D (synchronous), never looked up in p.media or decoded. The texture is sized for the largest
    // scale the clip can be drawn at (keys, key loops, presets: the RAW clip, capped). A lower third's built-in slide is off at
    // an edge that has an in/out preset (5B D13): the resolved clip has no `motion`, so the RAW clip decides.
    ctx.assertUsable();
    const builtIn = { in: !raw.motion?.in, out: !raw.motion?.out };
    const o = ctx.overlays.get(clip, p.format, te, p.format.fps, ctx.pixelScale(p.format), maxDrawnScale(raw), builtIn);
    state.shownOverlays.add(clip.id);
    return o ? { clip, ...o, uv: UPRIGHT } : null;
  }
  const media = p.media[clip.mediaId];
  // Clips of unknown or missing media are skipped.
  if (!media || media.missing) return null;
  if (clip.kind === 'image') return imageDraw(ctx, clip, media, state.shownImages);
  const source = sources.get(clip.id) ?? sources.get(clip.mediaId);
  if (!source) return null;
  return videoDraw(ctx, clip, source, t, p.format.fps, state.uses);
}

const plain = (d: FrameDraw | null): Draw | null => (d && !('adjustment' in d) && !('transition' in d) ? d : null);

/** The draw of a transition step at `t`; null when neither clip has a picture. */
export async function transitionDraw(
  ctx: DrawContext, p: Project, step: { transition: Transition; from: Clip; to: Clip; u: number }, t: number,
  sources: Map<Id, VideoSource>, state: CollectState,
): Promise<TransitionDraw | null> {
  const fps = p.format.fps;
  const a = plain(await clipDraw(ctx, p, step.from, t, edgeTime(step.from, t, fps), sources, state));
  const b = plain(await clipDraw(ctx, p, step.to, t, edgeTime(step.to, t, fps), sources, state));
  if (!a && !b) return null;
  return { transition: step.transition, a, b, u: step.u, e: easeAt(step.transition.ease, step.u), frame: frameIndex(t, fps), clip: (b ?? a)!.clip };
}
