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
  ): Promise<{ width: number; height: number; data: number[] }[]> {
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
        out.push(readPixels(canvas));
      }
      return out;
    } finally {
      compositor.dispose();
      for (const s of sources.values()) s.close();
    }
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
