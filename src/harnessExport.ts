// Export helpers of the in-browser test harness (see harness.ts; not part of the app build).
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import type { Project } from './core/model';
import { exportProject } from './export/exporter';
import { resetVideoSourceStats, videoSourceStats } from './media/decode';

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
  inspectMp4,
  videoSourceStats,
  resetVideoSourceStats,
  /**
   * Exports `p` (quality '1080p', optional test-only long side) and inspects the result. With `abortAt`, aborts
   * once progress reaches that fraction. Never rejects: errors come back as `error`.
   */
  async runExport(
    p: Project,
    opts: { maxLongSide?: number; abortAt?: number },
  ): Promise<{
    progress: number[];
    info: ExportInfo | null;
    error: { name: string; message: string; isDomException: boolean } | null;
    tempEntries: number;
  }> {
    const progress: number[] = [];
    const controller = new AbortController();
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
      return { progress, info, error: null, tempEntries: (await listExportTemp()).length };
    } catch (e) {
      const err = e as Error;
      return {
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
