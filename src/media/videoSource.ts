// The decoded video source: a bounded frame cache over a Mediabunny sample sink (split out of decode.ts, Plan 5D Task 1,
// to make room for reverse playback). `openVideoSource` and the VideoSource interface stay in decode.ts.
import { ALL_FORMATS, BlobSource, Input, VideoSampleSink } from 'mediabunny';
import type { Rotation, VideoSample } from 'mediabunny';
import type { VideoSource } from './decode';
import { noteDecoded } from './decodeStats';
import { ReverseRun } from './reverseRun';
export { resetVideoDecodeCount, videoDecodeCount } from './decodeStats';

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

/** Backward requests within this many seconds of the cached frames are reverse playback (a window is decoded); farther ones seek. */
const REVERSE_REACH = 2;

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

export function openInput(file: File): Input {
  return new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
}

export class DecodedVideoSource implements VideoSource {
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
  /** The reverse window: ascending frames decoded in one pass, served downwards; empty outside reverse playback. */
  private readonly reverse: ReverseRun | null;
  /** Serialises frameAt calls so the iterator and cache are never used concurrently. */
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    input: Input,
    sink: VideoSampleSink | null,
    firstTimestamp: number,
    readonly rotation: Rotation,
    readonly flip: boolean,
  ) {
    this.input = input;
    this.sink = sink;
    this.firstTimestamp = firstTimestamp;
    this.reverse = sink ? new ReverseRun(sink, firstTimestamp, () => this.closed) : null;
    stats.open++;
    stats.opened++;
    stats.peak = Math.max(stats.peak, stats.open);
  }

  frameAt(sourceTime: number): Promise<ImageBitmap | VideoFrame | null> {
    const run = this.queue.then(() => this.lookup(sourceTime));
    this.queue = run.catch(() => undefined);
    return run;
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    stats.open--;
    this.dropIterator();
    this.reverse?.dispose();
    this.input.dispose();
  }

  private async lookup(sourceTime: number): Promise<ImageBitmap | VideoFrame | null> {
    if (this.closed) throw new Error('VideoSource is closed');
    if (!this.sink) return null;
    const t = Math.max(Number.isFinite(sourceTime) ? sourceTime : 0, this.firstTimestamp);
    const reverse = this.reverse;
    reverse?.endLookup();
    const inRun = reverse?.frameAt(t) ?? null;
    if (inRun) return inRun;
    if (reverse?.active) {
      // Below the window: the next pass of reverse playback; beyond its end: the clip went forward again.
      if (t < reverse.start - EPS && reverse.start - t <= REVERSE_REACH) {
        this.dropIterator();
        const next = await reverse.fill(t, reverse.start);
        if (next) return next;
      } else {
        reverse.release();
      }
    }
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
        // Backward request before anything cached: a step of reverse playback decodes a window of frames ending here
        // (served downwards afterwards); a far jump back just seeks via Mediabunny's timestamp lookup.
        if (cache[0].start - t <= REVERSE_REACH) {
          this.dropIterator();
          const hit = await this.reverse?.fill(t, cache[0].start);
          if (hit) return hit;
        }
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
    noteDecoded();
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
