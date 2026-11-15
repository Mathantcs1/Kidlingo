// Phase 1 for the picture clips (split out of drawCollect.ts, Plan 5C Task 1): an image or a video frame uploaded into its
// own texture and described as a Draw.
import type { Clip, Id, MediaRef } from '../core/model';
import { videoSourceTime } from '../core/clipTime';
import type { VideoSource } from '../media/decode';
import { croppedUvMatrix } from './cropGeometry';
import type { Draw, DrawContext } from './drawCollect';
import { UPRIGHT } from './drawCollect';
import { createTexture, frameOrientation, rotatedSize, uploadTexture, uvMatrix } from './gl';
import type { Mat3, Size, TextureSlot } from './gl';

/**
 * The texture lookup of a picture whose uploaded texels are `texels` (display orientation): `orientation` composed with
 * the clip's crop sub-rectangle and flip (Plan 5E D1, D3). The crop edges are inset by half a texel so bilinear
 * sampling never reads cropped-away pixels (D7). The orientation itself when the clip has neither.
 */
function pictureUv(clip: Clip, orientation: Mat3, texels: Size): Mat3 {
  return croppedUvMatrix(orientation, clip.crop, clip.flip, { x: 0.5 / texels.width, y: 0.5 / texels.height });
}

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
export function pruneVideoSlots(ctx: DrawContext, sources: Map<Id, VideoSource>): void {
  const live = new Set(sources.values());
  for (const [source, slots] of ctx.videoSlots) {
    if (live.has(source)) continue;
    for (const s of slots) ctx.gl.deleteTexture(s.tex);
    ctx.videoSlots.delete(source);
  }
}


/** An image clip's draw (null when its texture could not be made). */
export async function imageDraw(ctx: DrawContext, clip: Clip, media: MediaRef, shownImages: Set<Id>): Promise<Draw | null> {
  const slot = await ctx.images.get(media, () => ctx.isLive());
  ctx.assertUsable();
  shownImages.add(clip.mediaId);
  // Transforms are in the image's own pixels, whatever resolution its texture was decoded at.
  const size = media.width && media.height ? { width: media.width, height: media.height } : slot;
  if (!slot || !size) return null;
  const texels = { width: slot.width, height: slot.height };
  return { clip, slot, size, uv: pictureUv(clip, UPRIGHT, texels), texels };
}

/** A video clip's draw at timeline time `t` (null when the source has no usable frame there). */
export async function videoDraw(ctx: DrawContext, clip: Clip, source: VideoSource, t: number, fps: number, uses: Map<VideoSource, number>): Promise<Draw | null> {
  const frame = await source.frameAt(videoSourceTime(clip, t, fps));
  ctx.assertUsable();
  if (!frame) return null;
  const width = 'displayWidth' in frame ? frame.displayWidth : frame.width;
  const height = 'displayHeight' in frame ? frame.displayHeight : frame.height;
  if (!(width > 0 && height > 0)) return null;
  const n = uses.get(source) ?? 0;
  uses.set(source, n + 1);
  const slot = videoSlot(ctx, source, n);
  uploadTexture(ctx.gl, slot, frame, width, height);
  // Frames arrive unrotated; draw them at their displayed size and turn the texture lookup instead.
  const { rotation, mirror } = frameOrientation(source, frame as { rotation?: unknown; flip?: unknown });
  const size = rotatedSize({ width, height }, rotation);
  // The frame is uploaded at its display size, so the texels match `size` once rotated.
  return { clip, slot, size, uv: pictureUv(clip, uvMatrix(rotation, false, mirror), size), texels: size };
}
