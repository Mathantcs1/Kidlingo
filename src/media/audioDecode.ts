import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import { noteAudioBuffer } from '../audio/stats';
import type { Id } from '../core/model';
import { getMediaFile } from './storage';

/** Decoded audio plus the exact SOURCE time (seconds) of its first sample. */
export interface DecodedAudio {
  buffer: AudioBuffer;
  /** Source time of sample 0: `from` snapped to the track's sample grid (within half a sample of it). */
  start: number;
}

const abortError = (): DOMException => new DOMException('Aborted', 'AbortError');

/**
 * Decodes [from, to) seconds of the media's SOURCE timeline into an AudioBuffer at the media's native sample
 * rate. The range is clamped to the audio track; returns null when the media has no audio or the clamped range
 * is empty. Only the packets covering the range are read and decoded (Mediabunny adds the codec's pre-roll).
 *
 * Samples sit on a fixed grid: sample i of the buffer is source sample round(from * rate) + i. Ranges that
 * share a boundary therefore tile the source exactly (no sample duplicated or lost), and `start` says where
 * the buffer begins so callers can schedule it with sub-sample precision. Rejects with an AbortError when
 * `signal` aborts.
 */
export async function decodeAudioRange(
  mediaId: Id,
  from: number,
  to: number,
  ctx: BaseAudioContext,
  signal?: AbortSignal,
): Promise<DecodedAudio | null> {
  const input = new Input({ source: new BlobSource(await getMediaFile(mediaId)), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const start = Math.max(from, 0);
    const end = Math.min(to, await track.computeDuration());
    if (!(end > start)) return null;
    const sampleRate = track.sampleRate;
    const channels = track.numberOfChannels;
    const first = Math.round(start * sampleRate);
    const length = Math.round(end * sampleRate) - first;
    if (length <= 0 || channels <= 0) return null;
    if (signal?.aborted) throw abortError();

    const out = ctx.createBuffer(channels, length, sampleRate);
    noteAudioBuffer(out);
    let tmp = new Float32Array(0);
    for await (const sample of new AudioSampleSink(track).samples(start, end)) {
      try {
        if (signal?.aborted) throw abortError();
        const offset = Math.round(sample.timestamp * sampleRate) - first;
        const srcOffset = Math.max(0, -offset);
        const dstOffset = Math.max(0, offset);
        const count = Math.min(sample.numberOfFrames - srcOffset, length - dstOffset);
        if (count <= 0) continue;
        if (tmp.length < count) tmp = new Float32Array(count);
        const view = tmp.subarray(0, count);
        for (let c = 0; c < Math.min(channels, sample.numberOfChannels); c++) {
          sample.copyTo(view, { planeIndex: c, format: 'f32-planar', frameOffset: srcOffset, frameCount: count });
          out.copyToChannel(view, c, dstOffset);
        }
      } finally {
        sample.close();
      }
    }
    return { buffer: out, start: first / sampleRate };
  } finally {
    input.dispose();
  }
}

/** decodeAudioRange without the start time (see there). */
export async function decodeAudio(
  mediaId: Id,
  from: number,
  to: number,
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  return (await decodeAudioRange(mediaId, from, to, ctx))?.buffer ?? null;
}
