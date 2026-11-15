// Whole-buffer and sliced consumers of a MixdownStream (split out of mixdown.ts, Plan 5D Task 1, to make room for the
// retimed-clip scheduling). mixdown.ts re-exports both, so existing imports keep working.
import type { Project } from '../core/model';
import { MixdownStream, sliceBuffer } from './mixdown';
import type { MixdownOptions } from './mixdown';

/**
 * Renders the project's audio to one stereo AudioBuffer covering [0, timelineDuration(p)), built from
 * MixdownStream windows. Each audible clip's [in, out) source range is decoded at the media's native rate (the
 * context resamples), placed at `clip.start` and played through its clip chain (see chain.ts). Returns null if nothing is audible.
 */
export async function renderMixdown(
  p: Project,
  sampleRate = 48000,
  opts: MixdownOptions = {},
): Promise<AudioBuffer | null> {
  const stream = new MixdownStream(p, sampleRate, opts);
  if (!stream.audible) return null;
  const out = new AudioBuffer({ length: stream.length, numberOfChannels: 2, sampleRate });
  for (let at = 0, w = await stream.next(); w; at += w.length, w = await stream.next()) {
    for (let c = 0; c < 2; c++) out.copyToChannel(w.getChannelData(c), c, at);
  }
  return stream.decoded > 0 ? out : null;
}

/**
 * Hands a MixdownStream to an encoder in slices of `slice` sample frames, rendering the next window only when
 * the previous one has been handed out, so at most one window is held at a time.
 */
export class MixdownFeeder {
  /** Sample frames handed out so far. */
  fed = 0;
  private window: AudioBuffer | null = null;
  private pos = 0;

  constructor(
    readonly stream: MixdownStream,
    private readonly slice: number,
  ) {}

  /** Hands out audio up to `seconds` (clamped to the mix length) through `add`. */
  async feedUntil(seconds: number, add: (b: AudioBuffer) => Promise<void>): Promise<void> {
    const end = Math.min(this.stream.length, Math.ceil(seconds * this.stream.sampleRate));
    while (this.fed < end) {
      if (!this.window || this.pos >= this.window.length) {
        this.window = await this.stream.next();
        this.pos = 0;
        if (!this.window) return;
      }
      const n = Math.min(this.slice, this.window.length - this.pos, end - this.fed);
      await add(sliceBuffer(this.window, this.pos, this.pos + n));
      this.pos += n;
      this.fed += n;
    }
    if (this.window && this.pos >= this.window.length) this.window = null;
  }
}
