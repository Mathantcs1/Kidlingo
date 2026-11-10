// Export helpers of the in-browser test harness (see harness.ts; not part of the app build).
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import type { Project } from './core/model';
import { exportProject } from './export/exporter';
import { resetVideoSourceStats, videoSourceStats } from './media/decode';
import { MixdownStream, renderMixdown } from './audio/mixdown';
import { audioStats, resetAudioStats } from './audio/stats';

function levels(b: AudioBuffer): { peak: number; rms: number } {
  let peak = 0;
  let sum = 0;
  for (let c = 0; c < b.numberOfChannels; c++) {
    for (const x of b.getChannelData(c)) {
      peak = Math.max(peak, Math.abs(x));
      sum += x * x;
    }
  }
  return { peak, rms: Math.sqrt(sum / (b.length * b.numberOfChannels)) };
}

export interface ExportInfo {
  format: string;
  videoCodec: string | null;
  audioCodec: string | null;
  duration: number;
  width: number;
  height: number;
  /** Peak absolute sample of the decoded audio track (0 without audio). */
  audioPeak: number;
}

/** Parses an exported file with Mediabunny and decodes its audio to find the peak level. */
async function inspectMp4(blob: Blob): Promise<ExportInfo> {
  const input = new Input({ source: new BlobSource(blob), formats: ALL_FORMATS });
  try {
    const format = (await input.getFormat()).name;
    const v = await input.getPrimaryVideoTrack();
    const a = await input.getPrimaryAudioTrack();
    let audioPeak = 0;
    if (a) {
      for await (const { buffer } of new AudioBufferSink(a).buffers()) {
        for (let c = 0; c < buffer.numberOfChannels; c++) {
          for (const x of buffer.getChannelData(c)) audioPeak = Math.max(audioPeak, Math.abs(x));
        }
      }
    }
    return {
      format,
      videoCodec: v ? await v.getCodec() : null,
      audioCodec: a ? await a.getCodec() : null,
      duration: await input.computeDuration(),
      width: v ? await v.getDisplayWidth() : 0,
      height: v ? await v.getDisplayHeight() : 0,
      audioPeak,
    };
  } finally {
    input.dispose();
  }
}

async function listExportTemp(): Promise<string[]> {
  const root = await navigator.storage.getDirectory();
  const dir = (await root.getDirectoryHandle('clipforge-export', { create: true })) as unknown as {
    keys(): AsyncIterable<string>;
  };
  const names: string[] = [];
  for await (const n of dir.keys()) names.push(n);
  return names.sort();
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

export const exportHarness = {
  listExportTemp,
  audioStats,
  resetAudioStats,
  /**
   * Renders the mix in windows of `windowSeconds` and in one pass; returns both levels, the largest per-sample
   * difference anywhere, and the largest within 10 ms of a window boundary.
   */
  async mixdownCompare(p: Project, sampleRate: number, windowSeconds: number) {
    const windowed = await renderMixdown(p, sampleRate, { windowSeconds });
    const single = await renderMixdown(p, sampleRate, { windowSeconds: Infinity });
    if (!windowed || !single) return null;
    let maxDiff = 0;
    let boundaryDiff = 0;
    const w = Math.round(windowSeconds * sampleRate);
    const near = Math.round(0.01 * sampleRate);
    for (let c = 0; c < 2; c++) {
      const a = windowed.getChannelData(c);
      const b = single.getChannelData(c);
      for (let i = 0; i < a.length; i++) {
        const d = Math.abs(a[i] - b[i]);
        maxDiff = Math.max(maxDiff, d);
        const m = i % w;
        if (i >= w - near && (m < near || m >= w - near)) boundaryDiff = Math.max(boundaryDiff, d);
      }
    }
    return {
      lengths: [windowed.length, single.length],
      windowed: levels(windowed),
      single: levels(single),
      maxDiff,
      boundaryDiff,
    };
  },
  /** Renders one window, aborts, and reports how the next window ends. */
  async mixdownAbortAfterFirstWindow(p: Project): Promise<{ first: number; error: string; ms: number }> {
    const controller = new AbortController();
    const stream = new MixdownStream(p, 48000, { signal: controller.signal });
    const first = (await stream.next())?.length ?? 0;
    controller.abort();
    const t0 = performance.now();
    try {
      await stream.next();
      return { first, error: 'none', ms: performance.now() - t0 };
    } catch (e) {
      return { first, error: (e as Error).name, ms: performance.now() - t0 };
    }
  },
  inspectMp4,
  videoSourceStats,
  resetVideoSourceStats,
  /**
   * Exports `p` (quality '1080p', optional test-only long side) and inspects the result. With `abortAt`, aborts
   * once progress reaches that fraction. Never rejects: errors come back as `error`.
   */
  async runExport(
    p: Project,
    opts: { maxLongSide?: number; abortAt?: number; abortAfterMs?: number },
  ): Promise<{
    progress: number[];
    info: ExportInfo | null;
    error: { name: string; message: string; isDomException: boolean } | null;
    tempEntries: number;
    /** Milliseconds from abort() to the rejection (abortAfterMs only). */
    abortLatency: number | null;
  }> {
    const progress: number[] = [];
    const controller = new AbortController();
    let abortedAt = 0;
    if (opts.abortAfterMs !== undefined) {
      setTimeout(() => {
        abortedAt = performance.now();
        controller.abort();
      }, opts.abortAfterMs);
    }
    const latency = (): number | null => (abortedAt ? performance.now() - abortedAt : null);
    try {
      const blob = await exportProject(p, {
        quality: '1080p',
        maxLongSide: opts.maxLongSide,
        signal: controller.signal,
        onProgress: (f) => {
          progress.push(f);
          if (opts.abortAt !== undefined && f >= opts.abortAt) controller.abort();
        },
      });
      const info = await inspectMp4(blob);
      return { progress, info, error: null, tempEntries: (await listExportTemp()).length, abortLatency: latency() };
    } catch (e) {
      const abortLatency = latency();
      const err = e as Error;
      return {
        abortLatency,
        progress,
        info: null,
        error: { name: err.name, message: err.message, isDomException: e instanceof DOMException },
        tempEntries: (await listExportTemp()).length,
      };
    }
  },
  /** Exports `p` at '1080p' (optional test-only long side) and returns the file as base64 for inspection in Node. */
  async exportBase64(p: Project, maxLongSide?: number): Promise<string> {
    const blob = await exportProject(p, {
      quality: '1080p',
      maxLongSide,
      signal: new AbortController().signal,
      onProgress: () => undefined,
    });
    return base64(new Uint8Array(await blob.arrayBuffer()));
  },
};
