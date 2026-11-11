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
import { cleanupExportTemp, exportProject } from './export/exporter';
import { exportHarness } from './harnessExport';
import { audioHarness } from './harnessAudio';
import { effectsHarness } from './harnessEffects';
import { readPixels } from './harnessPixels';
import { createMixer, renderMixdown } from './audio/mixer';
import type { ScheduledPiece } from './audio/mixer';
import { audioStats, resetAudioStats } from './audio/stats';

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

type Rgb = [number, number, number];

/**
 * A PNG of the given size: solid `rgb`; or, with `right`, `rgb` on the left half and `right` on the right half; or,
 * with `stripes`, 1 px white columns every `stripes` px on black (a pattern that aliases badly when downscaled). With
 * `bottom`, the bottom half (or bottom-right quarter, with `right`) is `bottom`.
 */
async function makePng(
  width: number, height: number, rgb: Rgb, opts: { right?: Rgb; stripes?: number; bottom?: Rgb } = {},
): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  const css = (c: Rgb): string => `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
  ctx.fillStyle = css(opts.stripes ? [0, 0, 0] : rgb);
  ctx.fillRect(0, 0, width, height);
  if (opts.right) {
    ctx.fillStyle = css(opts.right);
    ctx.fillRect(width / 2, 0, width / 2, height);
  }
  if (opts.bottom) {
    ctx.fillStyle = css(opts.bottom);
    ctx.fillRect(opts.right ? width / 2 : 0, height / 2, opts.right ? width / 2 : width, height / 2);
  }
  if (opts.stripes) {
    ctx.fillStyle = css(rgb);
    for (let x = 0; x < width; x += opts.stripes) ctx.fillRect(x, 0, 1, height);
  }
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('toBlob failed'))), 'image/png'),
  );
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
  /** Stores a PNG (see makePng) as image media under a fresh id; returns its MediaRef (not part of any project). */
  async putImageMedia(
    width: number, height: number, rgb: Rgb, opts?: { right?: Rgb; stripes?: number; bottom?: Rgb },
  ): Promise<MediaRef> {
    const id = newId();
    await putMedia(id, await makePng(width, height, rgb, opts));
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
  ...exportHarness,
  ...audioHarness,
  ...effectsHarness,
  renderMixdown,
  createMixer,
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
  /**
   * Plays `p` from `from` with a live mixer of the given window length, samples its clock every 100 ms for `ms`,
   * then stops. Returns the clock samples, every scheduled piece and the audio stats during and after.
   */
  async liveMixerRun(p: Project, from: number, opts: { windowSeconds: number; ms: number }) {
    const schedule: ScheduledPiece[] = [];
    const ctx = new AudioContext();
    void ctx.resume();
    const mixer = createMixer({ context: ctx, windowSeconds: opts.windowSeconds, onSchedule: (s) => schedule.push(s) });
    resetAudioStats();
    await mixer.play(p, from);
    const samples: number[] = [];
    const t0 = performance.now();
    while (performance.now() - t0 < opts.ms) {
      samples.push(mixer.currentTime());
      await new Promise((r) => setTimeout(r, 100));
    }
    const during = audioStats();
    const state = ctx.state;
    const ctxStart = mixer.debugClockStart();
    mixer.stop();
    const after = audioStats();
    await ctx.close();
    return { samples, schedule, during, after, state, ctxStart };
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
