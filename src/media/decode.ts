import { ALL_FORMATS, AudioSampleSink, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import type { Rotation, VideoSample } from 'mediabunny';
import type { Id } from '../core/model';
import { getMediaFile } from './storage';

/** Random access to the decoded frames of one media file's primary video track. */
export interface VideoSource {
  /**
   * Returns the frame shown at `sourceTime` seconds: the last frame whose timestamp is <= `sourceTime`
   * (the first frame for earlier times, the last frame for times beyond the end), or null when the media
   * has no video track.
   *
   * Ownership: the returned frame belongs to this source and is valid ONLY until the next `frameAt` call
   * or `close()`. Draw or upload it immediately; never close it or keep it.
   */
  frameAt(sourceTime: number): Promise<ImageBitmap | VideoFrame | null>;
  /**
   * Clockwise rotation (degrees) the track's metadata asks for. Frames from `frameAt` are NOT rotated: draw them
   * turned by this much (portrait phone videos are usually stored landscape with 90 or 270).
   */
  readonly rotation: Rotation;
  /** Releases the decoders, cached frames and the underlying Input. Safe to call more than once. */
  close(): void;
}

/** Decoded frames kept around (a contiguous run from the current iterator). */
const MAX_CACHED_FRAMES = 4;
/** Forward requests within this many seconds of the newest decoded frame advance the iterator instead of seeking. */
const FORWARD_WINDOW = 2;
/**
 * Tolerance (s) for time comparisons: requests at n/fps must hit frame n even when the stored timestamp, or
 * `timestamp + duration` of the previous frame, lands a few ulps on the wrong side. Far below any frame period.
 */
const EPS = 1e-4;

interface CachedFrame {
  start: number;
  end: number;
  frame: VideoFrame;
}

/** Live/peak counts of open VideoSources (instrumentation for tests and leak checks). */
const stats = { open: 0, peak: 0, opened: 0 };

/** How many VideoSources are open now, the most open at once since the last reset, and how many were opened. */
export function videoSourceStats(): { open: number; peak: number; opened: number } {
  return { ...stats };
}

/** Restarts the peak and opened counts from the current number of open sources. */
export function resetVideoSourceStats(): void {
  stats.peak = stats.open;
  stats.opened = 0;
}

function openInput(file: File): Input {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

class DecodedVideoSource implements VideoSource {
  private readonly input: Input;
  private readonly sink: VideoSampleSink | null;
  private readonly firstTimestamp: number;
  /** Frames from `iter`, in presentation order; always contiguous. */
  private cache: CachedFrame[] = [];
  private iter: AsyncGenerator<VideoSample, void, unknown> | null = null;
  private iterDone = false;
  /** The time `iter` was started at; frames before it were skipped by the decoder. */
  private iterStart = 0;
  private closed = false;
  /** Serialises frameAt calls so the iterator and cache are never used concurrently. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    input: Input,
    sink: VideoSampleSink | null,
    firstTimestamp: number,
    readonly rotation: Rotation,
  ) {
    this.input = input;
    this.sink = sink;
    this.firstTimestamp = firstTimestamp;
    stats.open++;
    stats.opened++;
    stats.peak = Math.max(stats.peak, stats.open);
  }

  frameAt(sourceTime: number): Promise<VideoFrame | null> {
    const run = this.queue.then(() => this.lookup(sourceTime));
    this.queue = run.catch(() => undefined);
    return run;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    stats.open--;
    this.dropIterator();
    this.input.dispose();
  }

  private async lookup(sourceTime: number): Promise<VideoFrame | null> {
    if (this.closed) throw new Error('VideoSource is closed');
    if (!this.sink) return null;
    const t = Math.max(Number.isFinite(sourceTime) ? sourceTime : 0, this.firstTimestamp);
    let seeked = false;
    if (!this.iter) {
      this.seek(t);
      seeked = true;
    }
    for (;;) {
      const cache = this.cache;
      let idx = -1;
      for (let i = cache.length - 1; i >= 0; i--) {
        if (cache[i].start <= t + EPS) {
          idx = i;
          break;
        }
      }
      if (cache.length > 0 && idx === -1) {
        // A fresh seek starts at the frame covering t; if it starts later (gap, odd first timestamp), that
        // first frame is the answer. Never seek twice for one request.
        if (seeked) return cache[0].frame;
        // Backward request before anything cached: seek via Mediabunny's timestamp lookup.
        this.seek(t);
        seeked = true;
        continue;
      }
      if (idx >= 0 && (idx < cache.length - 1 || this.iterDone || t + EPS < cache[idx].end)) {
        return cache[idx].frame;
      }
      if (this.iterDone) return null; // Track has no frames at all.
      const newest = cache[cache.length - 1];
      if (!seeked && newest && t - Math.max(newest.start, this.iterStart) > FORWARD_WINDOW) {
        this.seek(t);
        seeked = true;
        continue;
      }
      if (!(await this.pull())) return null;
    }
  }

  /** Decodes the next frame from the iterator into the cache; false if the source was closed meanwhile. */
  private async pull(): Promise<boolean> {
    const iter = this.iter;
    if (!iter) return false;
    let result: IteratorResult<VideoSample, void>;
    try {
      result = await iter.next();
    } catch (e) {
      if (this.closed) return false;
      throw e;
    }
    if (result.done) {
      if (this.closed || iter !== this.iter) return !this.closed;
      this.iterDone = true;
      return true;
    }
    const sample = result.value;
    if (this.closed || iter !== this.iter) {
      sample.close();
      return !this.closed;
    }
    let frame: VideoFrame;
    try {
      frame = sample.toVideoFrame();
    } finally {
      sample.close();
    }
    this.cache.push({ start: sample.timestamp, end: sample.timestamp + sample.duration, frame });
    while (this.cache.length > MAX_CACHED_FRAMES) this.cache.shift()?.frame.close();
    return true;
  }

  /** Restarts decoding at the frame covering `t` (Mediabunny seeks to the preceding keyframe). */
  private seek(t: number): void {
    this.dropIterator();
    this.iterStart = t;
    if (this.sink) this.iter = this.sink.samples(t);
  }

  private dropIterator(): void {
    for (const c of this.cache) c.frame.close();
    this.cache = [];
    const iter = this.iter;
    this.iter = null;
    this.iterDone = false;
    // return() closes any samples the iterator has queued and stops its decoder.
    if (iter) void iter.return().catch(() => undefined);
  }
}

/** Opens the media's primary video track for frame access. Reads the file lazily; never loads it whole. */
export async function openVideoSource(mediaId: Id): Promise<VideoSource> {
  const input = openInput(await getMediaFile(mediaId));
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return new DecodedVideoSource(input, null, 0, 0);
    const first = await track.getFirstTimestamp();
    return new DecodedVideoSource(input, new VideoSampleSink(track), first, await track.getRotation());
  } catch (e) {
    input.dispose();
    throw e;
  }
}

/**
 * Decodes [from, to) seconds of the media's SOURCE timeline into an AudioBuffer at the media's native
 * sample rate. The range is clamped to the audio track; returns null when the media has no audio or the
 * clamped range is empty. Only the packets covering the range are read and decoded.
 */
export async function decodeAudio(
  mediaId: Id,
  from: number,
  to: number,
  ctx: BaseAudioContext,
): Promise<AudioBuffer | null> {
  const input = openInput(await getMediaFile(mediaId));
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    const start = Math.max(from, 0);
    const end = Math.min(to, await track.computeDuration());
    if (!(end > start)) return null;
    const sampleRate = track.sampleRate;
    const channels = track.numberOfChannels;
    const length = Math.round((end - start) * sampleRate);
    if (length <= 0 || channels <= 0) return null;

    const out = ctx.createBuffer(channels, length, sampleRate);
    const sink = new AudioSampleSink(track);
    for await (const sample of sink.samples(start, end)) {
      try {
        const offset = Math.round((sample.timestamp - start) * sampleRate);
        const srcOffset = Math.max(0, -offset);
        const dstOffset = Math.max(0, offset);
        const count = Math.min(sample.numberOfFrames - srcOffset, length - dstOffset);
        if (count <= 0) continue;
        const tmp = new Float32Array(count);
        for (let c = 0; c < Math.min(channels, sample.numberOfChannels); c++) {
          sample.copyTo(tmp, { planeIndex: c, format: 'f32-planar', frameOffset: srcOffset, frameCount: count });
          out.copyToChannel(tmp, c, dstOffset);
        }
      } finally {
        sample.close();
      }
    }
    return out;
  } finally {
    input.dispose();
  }
}
