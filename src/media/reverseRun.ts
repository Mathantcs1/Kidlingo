// The decoded WINDOW of reverse playback (Plan 5D Task 7): frames of one decode pass held as ImageBitmaps (no decoder
// frame stays pinned), served downwards; the next pass decodes the window below it (planner and budget: reverseCache.ts).
import type { VideoSampleSink } from 'mediabunny';
import { noteDecoded } from './decodeStats';
import { REVERSE_CACHE_BYTES, REVERSE_CACHE_TOTAL_BYTES, frameBytes, holdBytes, nextWindow, reverseBytes, windowFrames } from './reverseCache';

/** Tolerance (s) for time comparisons, as in videoSource.ts. */
const EPS = 1e-4;

interface RunFrame {
  start: number;
  end: number;
  frame: ImageBitmap;
}

export class ReverseRun {
  private run: RunFrame[] = [];
  /** The VideoFrame wrapper last returned (valid until the next lookup, then closed). */
  private wrapped: VideoFrame | null = null;
  private frameDur = 1 / 30;
  private bytesPerFrame = frameBytes(1920, 1080);

  constructor(
    private readonly sink: VideoSampleSink,
    private readonly firstTimestamp: number,
    private readonly isClosed: () => boolean,
  ) {}

  /** Whether a window is held. */
  get active(): boolean {
    return this.run.length > 0;
  }

  /** The timestamp of the lowest held frame. */
  get start(): number {
    return this.run[0].start;
  }

  /** Closes the wrapper of the previous lookup (frames are valid only until the next one). */
  endLookup(): void {
    this.wrapped?.close();
    this.wrapped = null;
  }

  /** The window frame showing `t` (the last one starting at or before it), or null when `t` is outside the window. */
  frameAt(t: number): VideoFrame | null {
    const run = this.run;
    if (run.length === 0 || t < run[0].start - EPS || t >= run[run.length - 1].end - EPS) return null;
    let pick = run[0];
    for (let i = run.length - 1; i >= 0; i--) {
      if (run[i].start <= t + EPS) {
        pick = run[i];
        break;
      }
    }
    return this.wrap(pick);
  }

  /** Decodes the window that ends at `below` (or just past `t`) and returns the frame at `t`; null when nothing was decoded. */
  async fill(t: number, below: number | null): Promise<VideoFrame | null> {
    const own = this.run.length * this.bytesPerFrame;
    const free = REVERSE_CACHE_TOTAL_BYTES - reverseBytes().held + own;
    const n = windowFrames(this.bytesPerFrame, REVERSE_CACHE_BYTES, free);
    const { lo, hi } = nextWindow(t, below, this.frameDur, n, this.firstTimestamp);
    // The old window is below the request's reach: free it first so the held bytes never exceed the budget.
    this.release();
    const frames: RunFrame[] = [];
    const iter = this.sink.samples(lo, hi);
    try {
      for (;;) {
        const r = await iter.next();
        if (r.done) break;
        const s = r.value;
        if (this.isClosed() || s.timestamp >= hi - EPS) {
          s.close();
          break;
        }
        let bitmap: ImageBitmap;
        const vf = s.toVideoFrame();
        try {
          bitmap = await createImageBitmap(vf);
        } finally {
          vf.close();
          s.close();
        }
        noteDecoded();
        if (s.duration > 0) this.frameDur = s.duration;
        frames.push({ start: s.timestamp, end: s.timestamp + s.duration, frame: bitmap });
      }
    } finally {
      void iter.return?.(undefined).catch(() => undefined);
    }
    if (this.isClosed() || frames.length === 0) {
      for (const f of frames) f.frame.close();
      return null;
    }
    this.run = frames;
    this.bytesPerFrame = frameBytes(frames[0].frame.width, frames[0].frame.height);
    holdBytes(frames.length * this.bytesPerFrame);
    return this.frameAt(t) ?? this.wrap(frames[0]);
  }

  release(): void {
    if (this.run.length === 0) return;
    for (const f of this.run) f.frame.close();
    holdBytes(-this.run.length * this.bytesPerFrame);
    this.run = [];
  }

  dispose(): void {
    this.endLookup();
    this.release();
  }

  private wrap(f: RunFrame): VideoFrame {
    this.wrapped = new VideoFrame(f.frame, { timestamp: Math.round(f.start * 1e6), duration: Math.round((f.end - f.start) * 1e6) });
    return this.wrapped;
  }
}
