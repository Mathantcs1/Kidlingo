import { resolveClip } from '../core/animate';
import { maxDrawnScale } from '../core/drawnScale';
import type { Clip, Id, Project } from '../core/model';
import type { VideoSource } from '../media/decode';
import { createTexture, frameOrientation, rotatedSize, uploadTexture, uvMatrix } from './gl';
import type { Mat3, Size, TextureSlot } from './gl';
import type { ImageTextures } from './images';
import type { OverlayTextures } from './overlays/textures';
import { visualClipsAt } from './visible';

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
export type FrameDraw = Draw | AdjustmentDraw;

export const isAdjustmentDraw = (d: FrameDraw): d is AdjustmentDraw => 'adjustment' in d;

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

const UPRIGHT = uvMatrix(0);

function videoSlot(ctx: DrawContext, source: VideoSource, index: number): TextureSlot {
  let slots = ctx.videoSlots.get(source);
  if (!slots) {
    slots = [];
    ctx.videoSlots.set(source, slots);
  }
  while (slots.length <= index) slots.push({ tex: createTexture(ctx.gl), width: 0, height: 0 });
  return slots[index];
}

/** Drops textures of sources the caller no longer passes (they may have been closed). */
function pruneVideoSlots(ctx: DrawContext, sources: Map<Id, VideoSource>): void {
  const live = new Set(sources.values());
  for (const [source, slots] of ctx.videoSlots) {
    if (live.has(source)) continue;
    for (const s of slots) ctx.gl.deleteTexture(s.tex);
    ctx.videoSlots.delete(source);
  }
}

/**
 * Phase 1 (async): fetch every frame/bitmap and upload it into its own texture. Nothing is drawn to the
 * canvas, so the browser can never present a half-composited frame while we wait on decoders. Each visible clip is
 * resolved ONCE here (Plan 5 D7): every draw carries the clip as seen at `t` (static clips: the stored object itself),
 * so nothing after this reads keys. Hidden tracks are filtered out before resolution.
 */
export async function collectDraws(ctx: DrawContext, p: Project, t: number, sources: Map<Id, VideoSource>): Promise<FrameDraw[]> {
  const draws: FrameDraw[] = [];
  const uses = new Map<VideoSource, number>();
  const shownImages = new Set<Id>();
  const shownOverlays = new Set<Id>();
  for (const raw of visualClipsAt(p, t)) {
    const clip = resolveClip(raw, t, p.format);
    if (clip.kind === 'adjustment') {
      // No media and nothing to upload: the compositor applies it to the composite so far.
      draws.push({ clip, adjustment: true });
      continue;
    }
    if (clip.kind === 'overlay') {
      // No media: drawn with Canvas2D (synchronous), never looked up in p.media or decoded. The texture is sized for
      // the largest scale the clip can be drawn at (keys, key loops, presets: the RAW clip, capped), so an animated
      // scale or a preset neither re-draws it per frame nor blurs it. A lower third's built-in slide is off at an edge
      // that has an in/out preset (5B D13): the resolved clip has no `motion`, so the RAW clip decides.
      ctx.assertUsable();
      const builtIn = { in: !raw.motion?.in, out: !raw.motion?.out };
      const o = ctx.overlays.get(clip, p.format, t, p.format.fps, ctx.pixelScale(p.format), maxDrawnScale(raw), builtIn);
      if (o) draws.push({ clip, ...o, uv: UPRIGHT });
      shownOverlays.add(clip.id);
      continue;
    }
    const media = p.media[clip.mediaId];
    // Clips of unknown or missing media are skipped.
    if (!media || media.missing) continue;
    if (clip.kind === 'image') {
      const slot = await ctx.images.get(media, () => ctx.isLive());
      ctx.assertUsable();
      shownImages.add(clip.mediaId);
      // Transforms are in the image's own pixels, whatever resolution its texture was decoded at.
      const size = media.width && media.height ? { width: media.width, height: media.height } : slot;
      if (slot && size) draws.push({ clip, slot, size, uv: UPRIGHT, texels: { width: slot.width, height: slot.height } });
      continue;
    }
    const source = sources.get(clip.id) ?? sources.get(clip.mediaId);
    if (!source) continue;
    const frame = await source.frameAt(clip.in + (t - clip.start));
    ctx.assertUsable();
    if (!frame) continue;
    const width = 'displayWidth' in frame ? frame.displayWidth : frame.width;
    const height = 'displayHeight' in frame ? frame.displayHeight : frame.height;
    if (!(width > 0 && height > 0)) continue;
    const n = uses.get(source) ?? 0;
    uses.set(source, n + 1);
    const slot = videoSlot(ctx, source, n);
    uploadTexture(ctx.gl, slot, frame, width, height);
    // Frames arrive unrotated; draw them at their displayed size and turn the texture lookup instead.
    const { rotation, mirror } = frameOrientation(source, frame as { rotation?: unknown; flip?: unknown });
    const size = rotatedSize({ width, height }, rotation);
    // The frame is uploaded at its display size, so the texels match `size` once rotated.
    draws.push({ clip, slot, size, uv: uvMatrix(rotation, false, mirror), texels: size });
  }
  pruneVideoSlots(ctx, sources);
  ctx.images.prune(shownImages, p);
  ctx.overlays.prune(shownOverlays);
  return draws;
}
