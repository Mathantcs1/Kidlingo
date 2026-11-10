import { newId } from '../core/model';
import type { Id, Project } from '../core/model';
import { timelineDuration } from '../core/timeline';
import type { VideoSource } from '../media/decode';
import type { Compositor } from '../render/compositor';

// Browser-only modules (Mediabunny, WebGL compositor, decoders, Web Audio mixer) are imported lazily inside
// exportProject so this module stays importable in Node (unit tests) and they stay off the main bundle path.

export type ExportQuality = '1080p' | '4k';

export class ExportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExportError';
  }
}

export interface ExportOptions {
  quality: ExportQuality;
  onProgress(frac: number): void;
  signal: AbortSignal;
  /**
   * TEST-ONLY knob: overrides the quality's long side (1920 / 3840) so e2e tests can export tiny files on a
   * software renderer. The bitrate still follows `quality`. Leave unset in the app.
   */
  maxLongSide?: number;
}

const LONG_SIDE: Record<ExportQuality, number> = { '1080p': 1920, '4k': 3840 };
const VIDEO_BITRATE: Record<ExportQuality, number> = { '1080p': 12_000_000, '4k': 40_000_000 };
const AUDIO_BITRATE = 128_000;
const AUDIO_SAMPLE_RATE = 48_000;
/** Seconds between forced key frames. */
const KEY_FRAME_INTERVAL = 2;
/** Mixdown audio is handed to the muxer in slices of this many seconds, interleaved with the video frames. */
const AUDIO_SLICE = 1;
/** Share of the progress bar covered by encoding video frames; the remainder is finalizing. */
const FRAMES_SHARE = 0.95;
const TEMP_DIR = 'clipforge-export';

/** Rounds each side down to the nearest even number (H.264 needs even dimensions); never below 2. */
export function evenDims(w: number, h: number): { width: number; height: number } {
  const even = (v: number): number => Math.max(2, Math.floor(v / 2) * 2);
  return { width: even(w), height: even(h) };
}

/**
 * Scales the project format so its long side is 1920 ('1080p') or 3840 ('4k'), preserving aspect, then
 * rounds down to even dimensions. `longSide` overrides the quality's long side (test-only).
 */
export function exportSize(p: Project, q: ExportQuality, longSide = LONG_SIDE[q]): { width: number; height: number } {
  const { width, height } = p.format;
  const scale = longSide / Math.max(width, height);
  return evenDims(Math.round(width * scale), Math.round(height * scale));
}

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

function hasOpfs(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.storage?.getDirectory === 'function';
}

async function tempDir(): Promise<FileSystemDirectoryHandle> {
  const root = await navigator.storage.getDirectory();
  return root.getDirectoryHandle(TEMP_DIR, { create: true });
}

/** Removes every file in the export temp directory (call after the exported Blob has been downloaded). */
export async function cleanupExportTemp(): Promise<void> {
  if (!hasOpfs()) return;
  const dir = (await tempDir()) as unknown as FileSystemDirectoryHandle & { keys(): AsyncIterable<string> };
  const names: string[] = [];
  for await (const name of dir.keys()) names.push(name);
  await Promise.all(names.map((n) => dir.removeEntry(n, { recursive: true }).catch(() => undefined)));
}

let aacEncoderRegistered = false;

/** Uses the native AAC encoder when available, otherwise registers the WASM one (loaded on demand). */
async function ensureAacEncoder(mb: typeof import('mediabunny'), quality: InstanceType<typeof mb.Quality>): Promise<void> {
  if (aacEncoderRegistered) return;
  const native = await mb.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate: AUDIO_SAMPLE_RATE, quality });
  if (native) return;
  const { registerAacEncoder } = await import('@mediabunny/aac-encoder');
  registerAacEncoder();
  aacEncoderRegistered = true;
}

/** Copies [from, to) sample frames of `src` into a new AudioBuffer. */
function sliceBuffer(src: AudioBuffer, from: number, to: number): AudioBuffer {
  const out = new AudioBuffer({ length: to - from, numberOfChannels: src.numberOfChannels, sampleRate: src.sampleRate });
  for (let c = 0; c < src.numberOfChannels; c++) out.copyToChannel(src.getChannelData(c).subarray(from, to), c);
  return out;
}

/** Creates the render canvas: an OffscreenCanvas if it supports WebGL2, else a detached HTMLCanvasElement. */
function createExportCompositor(
  create: typeof import('../render/compositor').createCompositor,
  width: number,
  height: number,
): Compositor {
  let compositor: Compositor;
  try {
    if (typeof OffscreenCanvas === 'undefined') throw new Error('no OffscreenCanvas');
    compositor = create(new OffscreenCanvas(width, height), { preserveDrawingBuffer: true });
  } catch {
    compositor = create(document.createElement('canvas'), { preserveDrawingBuffer: true });
  }
  compositor.resize(width, height);
  return compositor;
}

interface TempFile {
  dir: FileSystemDirectoryHandle;
  name: string;
  handle: FileSystemFileHandle;
  writable: FileSystemWritableFileStream;
}

/**
 * Renders the project to an H.264 (+ AAC when anything is audible) MP4. The file is streamed into a temp
 * file in OPFS (`clipforge-export/`) and returned as a Blob backed by that file; call `cleanupExportTemp()`
 * once it has been saved. If OPFS is unavailable the file is built in memory instead (BufferTarget), which
 * limits very long 4K exports to what fits in RAM.
 *
 * Rejects with ExportError('Nothing to export') for an empty timeline, and with
 * DOMException('Aborted', 'AbortError') when `signal` aborts; either way every decoder, encoder, GL object
 * and temp file is released.
 */
export async function exportProject(p: Project, opts: ExportOptions): Promise<Blob> {
  const { quality, onProgress, signal } = opts;
  const duration = timelineDuration(p);
  if (!(duration > 0)) throw new ExportError('Nothing to export');
  if (signal.aborted) throw abortError();

  let lastProgress = 0;
  const progress = (frac: number): void => {
    const f = Math.min(1, Math.max(lastProgress, frac));
    lastProgress = f;
    onProgress(f);
  };
  const checkAbort = (): void => {
    if (signal.aborted) throw abortError();
  };

  const [mb, { createCompositor }, { openVideoSource }, { renderMixdown }] = await Promise.all([
    import('mediabunny'),
    import('../render/compositor'),
    import('../media/decode'),
    import('../audio/mixer'),
  ]);

  const { width, height } = exportSize(p, quality, opts.maxLongSide);
  const fps = p.format.fps;
  const frameCount = Math.max(1, Math.ceil(duration * fps - 1e-6));
  const videoQuality = new mb.Quality({ bitrate: VIDEO_BITRATE[quality] });
  const audioQuality = new mb.Quality({ bitrate: AUDIO_BITRATE });

  let compositor: Compositor | null = null;
  const sources = new Map<Id, VideoSource>();
  let output: InstanceType<typeof mb.Output> | null = null;
  let temp: TempFile | null = null;

  try {
    progress(0);
    if (!(await mb.canEncodeVideo('avc', { width, height, quality: videoQuality }))) {
      throw new ExportError(`This browser cannot encode H.264 video at ${width}x${height}`);
    }
    checkAbort();

    // The audio track must exist before the output starts, so the mixdown is rendered up front.
    const mixdown = await renderMixdown(p, AUDIO_SAMPLE_RATE);
    checkAbort();
    if (mixdown) await ensureAacEncoder(mb, audioQuality);
    checkAbort();

    compositor = createExportCompositor(createCompositor, width, height);
    for (const track of p.tracks) {
      if (track.kind !== 'video') continue;
      for (const clip of track.clips) {
        const media = p.media[clip.mediaId];
        if (clip.kind !== 'video' || !media || media.missing) continue;
        sources.set(clip.id, await openVideoSource(clip.mediaId));
        checkAbort();
      }
    }

    let target: InstanceType<typeof mb.StreamTarget> | InstanceType<typeof mb.BufferTarget>;
    if (hasOpfs()) {
      const dir = await tempDir();
      const name = `export-${newId()}.mp4`;
      const handle = await dir.getFileHandle(name, { create: true });
      temp = { dir, name, handle, writable: await handle.createWritable() };
      // Without fast start the muxer writes mdat first and patches sizes / appends moov at the end through
      // positioned writes, which FileSystemWritableFileStream accepts directly.
      target = new mb.StreamTarget(temp.writable, { chunked: true });
    } else {
      // Memory limit: the whole file is held in RAM; acceptable fallback for browsers without OPFS.
      target = new mb.BufferTarget();
    }
    checkAbort();

    output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: false }), target });
    const video = new mb.CanvasSource(compositor.canvas, {
      codec: 'avc',
      quality: videoQuality,
      keyFrameInterval: KEY_FRAME_INTERVAL,
    });
    output.addVideoTrack(video, { frameRate: fps });
    const audio = mixdown ? new mb.AudioBufferSource({ codec: 'aac', quality: audioQuality }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();

    const sliceLength = Math.round(AUDIO_SLICE * AUDIO_SAMPLE_RATE);
    let audioPos = 0;
    const feedAudioUntil = async (seconds: number): Promise<void> => {
      if (!audio || !mixdown) return;
      const end = Math.min(mixdown.length, Math.ceil(seconds * mixdown.sampleRate));
      while (audioPos < end) {
        const next = Math.min(mixdown.length, audioPos + sliceLength);
        await audio.add(sliceBuffer(mixdown, audioPos, next));
        audioPos = next;
      }
    };

    for (let n = 0; n < frameCount; n++) {
      checkAbort();
      const t = n / fps;
      // Keep audio a slice ahead of the video so the muxer can interleave without buffering a whole track.
      await feedAudioUntil(t + AUDIO_SLICE);
      await compositor.renderFrame(p, t, sources);
      await video.add(t, 1 / fps);
      progress(((n + 1) / frameCount) * FRAMES_SHARE);
    }
    checkAbort();
    await feedAudioUntil(Infinity);
    checkAbort();

    await output.finalize();

    let blob: Blob;
    if (temp) {
      // Wrapping the OPFS-backed File only references it (no copy) and gives the Blob an MP4 type.
      blob = new Blob([await temp.handle.getFile()], { type: 'video/mp4' });
    } else {
      const buffer = (target as InstanceType<typeof mb.BufferTarget>).buffer;
      if (!buffer) throw new ExportError('Export produced no data');
      blob = new Blob([buffer], { type: 'video/mp4' });
    }
    progress(1);
    return blob;
  } catch (e) {
    if (output) await output.cancel().catch(() => undefined);
    if (temp) {
      // If the output never took the stream, it is still open; abort it so the temp file can go.
      if (!temp.writable.locked) await temp.writable.abort().catch(() => undefined);
      await temp.dir.removeEntry(temp.name).catch(() => undefined);
    }
    if (signal.aborted) throw abortError();
    throw e;
  } finally {
    compositor?.dispose();
    for (const s of sources.values()) s.close();
  }
}
