// The audio of one planned segment, decoded and prepared for scheduling: ONE code path for the live mixer and the export
// (Plan 5D Task 8). A plain clip decodes [srcFrom, srcTo) plus margins from the file and applies noise reduction; a retimed
// clip decodes the footage its virtual range needs, applies noise reduction in the footage domain and then retimes it.
import { decodeAudioRange } from '../media/audioDecode';
import type { DecodedAudio } from '../media/audioDecode';
import { prepareSource } from './denoiseSource';
import type { Margins } from './effects/params';
import type { Segment } from './plan';
import { audioSpan, footageToDecode, isRetimedAudio } from './retime/retimeMath';
import { retimeBuffer } from './retime/retime';

/** Real source audio decoded past each window cut, so resampling at the cut sees its true neighbours. */
export const CUT_MARGIN = 0.05;

/** The lowest sample rate the kernel margin is sized for (a lower-rate file just gets a little more margin than it needs). */
const MIN_RATE = 8000;

/** null when the media has no audio in the range. Throws what decodeAudioRange throws (abort, unreadable file). */
export async function loadSegmentAudio(seg: Segment, margins: Margins, ctx: BaseAudioContext, signal?: AbortSignal): Promise<DecodedAudio | null> {
  const { clip } = seg;
  const [lo, hi] = audioSpan(clip);
  const from = Math.max(lo, seg.srcFrom - CUT_MARGIN - margins.pre);
  const to = Math.min(hi, seg.srcTo + CUT_MARGIN + margins.post);
  if (!isRetimedAudio(clip)) {
    const decoded = await decodeAudioRange(seg.mediaId, from, to, ctx, signal);
    return decoded && { ...decoded, buffer: await prepareSource(clip, decoded, ctx) };
  }
  const [a, b] = footageToDecode(clip, from, to, MIN_RATE);
  const decoded = await decodeAudioRange(seg.mediaId, a, b, ctx, signal);
  if (!decoded) return null;
  const prepared = { ...decoded, buffer: await prepareSource(clip, decoded, ctx) };
  return retimeBuffer(clip, prepared, from, to, ctx);
}
