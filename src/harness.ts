// In-browser test harness (served at /harness.html by the dev server; not part of the app build).
import { hasWebCodecs } from './media/support';
import { getMediaFile, hasMedia, listMediaIds, putMedia, removeMedia } from './media/storage';
import { clipFromMedia, importFile } from './media/import';
import { decodeAudio, openVideoSource } from './media/decode';
import { createCompositor } from './render/compositor';
import { fitTransform } from './core/merge';
import { newId } from './core/model';
import type { Id, MediaRef, Project } from './core/model';
import type { VideoSource } from './media/decode';
import { ALL_FORMATS, AudioBufferSink, BlobSource, Input } from 'mediabunny';
import { cleanupExportTemp, exportProject } from './export/exporter';
import { createMixer, renderMixdown } from './audio/mixer';

interface ExportInfo {
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

function peak(buffer: AudioBuffer, from: number, to: number): number {
  const a = Math.max(0, Math.floor(from * buffer.sampleRate));
  const b = Math.min(buffer.length, Math.ceil(to * buffer.sampleRate));
  let m = 0;
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    for (let i = a; i < b; i++) m = Math.max(m, Math.abs(data[i]));
  }
  return m;
}

/** A solid-colour PNG of the given size. */
async function makePng(width: number, height: number, rgb: [number, number, number]): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.fillStyle = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
  ctx.fillRect(0, 0, width, height);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
}

/** Reads the whole drawing buffer of a canvas with a WebGL2 context, top row first. */
function readPixels(canvas: HTMLCanvasElement): { width: number; height: number; data: number[] } {
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('canvas has no WebGL2 context');
  const { width, height } = canvas;
  const raw = new Uint8Array(width * height * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const data: number[] = new Array(raw.length);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * row;
    for (let i = 0; i < row; i++) data[y * row + i] = raw[src + i];
  }
  return { width, height, data };
}

const cf = {
  importFile,
  putMedia,
  getMediaFile,
  hasMedia,
  removeMedia,
  listMediaIds,
  clipFromMedia,
  hasWebCodecs,
  openVideoSource,
  decodeAudio,
  /** A context for `decodeAudio` to create AudioBuffers with (it is never rendered). */
  newAudioContext(sampleRate = 48000): BaseAudioContext {
    return new OfflineAudioContext(2, 48000, sampleRate);
  },
  createCompositor,
  fitTransform,
  makePng,
  readPixels,
  /** Stores a solid-colour PNG as image media under a fresh id; returns its MediaRef (not part of any project). */
  async putImageMedia(width: number, height: number, rgb: [number, number, number]): Promise<MediaRef> {
    const id = newId();
    await putMedia(id, await makePng(width, height, rgb));
    return { id, name: `${id}.png`, kind: 'image', duration: 5, width, height, hasAudio: false };
  },
  /**
   * Renders `p` at each time into a fresh canvas (default: p.format size) and returns its pixels. Opens a
   * VideoSource per (non-missing) video media, keyed by media id, unless `sources` is false.
   */
  async renderPixels(
    p: Project,
    times: number[],
    opts: { canvas?: { width: number; height: number }; sources?: boolean } = {},
  ): Promise<{ width: number; height: number; data: number[]; glError: number }[]> {
    const canvas = document.createElement('canvas');
    const compositor = createCompositor(canvas, { preserveDrawingBuffer: true });
    const sources = new Map<Id, VideoSource>();
    try {
      compositor.resize(opts.canvas?.width ?? p.format.width, opts.canvas?.height ?? p.format.height);
      if (opts.sources !== false) {
        for (const m of Object.values(p.media)) {
          if (m.kind === 'video' && !m.missing) sources.set(m.id, await openVideoSource(m.id));
        }
      }
      const out = [];
      for (const t of times) {
        await compositor.renderFrame(p, t, sources);
        const glError = canvas.getContext('webgl2')?.getError() ?? -1;
        out.push({ ...readPixels(canvas), glError });
      }
      return out;
    } finally {
      compositor.dispose();
      for (const s of sources.values()) s.close();
    }
  },
  exportProject,
  cleanupExportTemp,
  listExportTemp,
  inspectMp4,
  renderMixdown,
  createMixer,
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
  /** Renders a mixdown and returns its shape plus the peak level in each [from, to) window (seconds). */
  async mixdownStats(
    p: Project,
    sampleRate: number,
    windows: [number, number][],
  ): Promise<{ length: number; sampleRate: number; channels: number; peaks: number[] } | null> {
    const buffer = await renderMixdown(p, sampleRate);
    if (!buffer) return null;
    return {
      length: buffer.length,
      sampleRate: buffer.sampleRate,
      channels: buffer.numberOfChannels,
      peaks: windows.map(([a, b]) => peak(buffer, a, b)),
    };
  },
  /** Plays from 1 s, reads the clock, then stops twice. */
  async liveMixerSmoke(p: Project): Promise<{ before: number; played: boolean; during: number; stoppedTwice: boolean }> {
    const mixer = createMixer();
    const before = mixer.currentTime();
    await mixer.play(p, 1);
    const during = mixer.currentTime();
    let stoppedTwice = true;
    try {
      mixer.stop();
      mixer.stop();
    } catch {
      stoppedTwice = false;
    }
    return { before, played: true, during, stoppedTwice };
  },
  /** Imports the Nth file currently selected in `#harness-file`. */
  importInputFile(index: number): Promise<MediaRef> {
    const input = document.getElementById('harness-file') as HTMLInputElement | null;
    const file = input?.files?.[index];
    if (!file) return Promise.reject(new Error(`No file selected at index ${index}`));
    return importFile(file);
  },
};

declare global {
  interface Window {
    cf: typeof cf;
  }
}

window.cf = cf;
