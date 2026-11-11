import type { Id, Project } from '../core/model';
import { timelineDuration } from '../core/timeline';
import type { VideoSource } from '../media/decode';
import type { Compositor } from '../render/compositor';
import { ExportError } from './errors';
import { loadChunk } from '../loadChunk';
import { ensureAacEncoder } from './aacEncoder';
import { createExportCompositor } from './exportCompositor';
import { syncExportSources } from './exportSources';
import { exportSize } from './exportSize';
import type { ExportQuality } from './exportSize';
import { skippedEffectTypes } from '../render/effects/unavailable';
import type { ExportSkips } from '../render/effects/unavailable';
import { discardTempFile, hasOpfs, openTempFile, rememberTempName } from './exportTemp';
import type { TempFile } from './exportTemp';

// Browser-only modules (Mediabunny, WebGL compositor, decoders, Web Audio mixer) are imported lazily inside
// exportProject so this module stays importable in Node (unit tests) and they stay off the main bundle path.

export { ExportError };
export { createExportCompositor } from './exportCompositor';
export { evenDims, exportSize } from './exportSize';
export type { ExportQuality } from './exportSize';
export { cleanupExportTemp, exportTempName, exportUsesMemory } from './exportTemp';

export interface ExportOptions {
  quality: ExportQuality;
  onProgress(frac: number): void;
  signal: AbortSignal;
  /**
   * TEST-ONLY knob: overrides the quality's long side (1920 / 3840) so e2e tests can export tiny files on a
   * software renderer. The bitrate still follows `quality`. Leave unset in the app.
   */
  maxLongSide?: number;
  /**
   * Called once, when the export finished, if it left anything out (D8): effect types turned off this session after a
   * shader failure (Compositor.unavailableTypes(), used by a visible clip; read at the end because a failure noticed
   * by the preview is not reported again to the export's compositor) and the names of LUTs that would not load.
   */
  onSkipped?(skips: ExportSkips): void;
}

const VIDEO_BITRATE: Record<ExportQuality, number> = { '1080p': 12_000_000, '4k': 40_000_000 };
const AUDIO_BITRATE = 128_000;
const AUDIO_SAMPLE_RATE = 48_000;
/** Seconds between forced key frames. */
const KEY_FRAME_INTERVAL = 2;
/** Mixdown audio is handed to the muxer in slices of this many seconds, interleaved with the video frames. */
const AUDIO_SLICE = 1;
/** Share of the progress bar covered by rendering audio and video; the remainder is finalizing. */
const FRAMES_SHARE = 0.95;
/** Part of FRAMES_SHARE given to rendering the audio mix (when anything is audible). */
const AUDIO_SHARE = 0.15;

function abortError(): DOMException {
  return new DOMException('Aborted', 'AbortError');
}

/**
 * Renders the project to an H.264 (+ AAC when anything is audible) MP4. The file is streamed into a temp
 * file in OPFS (`clipforge-export/`) and returned as a Blob backed by that file (see exportTempName); it stays
 * there until `cleanupExportTemp()` runs (before the next export, and at app start). If OPFS is unavailable the
 * file is built in memory instead (BufferTarget), which limits very long 4K exports to what fits in RAM. The
 * audio mix is rendered in EXPORT_WINDOW_SECONDS windows interleaved with the frames, so memory does not grow
 * with the project length.
 *
 * Rejects with ExportError('Nothing to export') for an empty timeline, ExportError('Invalid frame rate') for a
 * non-finite or non-positive project fps, and with
 * DOMException('Aborted', 'AbortError') when `signal` aborts; either way every decoder, encoder, GL object
 * and temp file is released.
 */
export async function exportProject(p: Project, opts: ExportOptions): Promise<Blob> {
  const { quality, onProgress, signal } = opts;
  const duration = timelineDuration(p);
  if (!(duration > 0)) throw new ExportError('Nothing to export');
  if (!(Number.isFinite(p.format.fps) && p.format.fps > 0)) throw new ExportError('Invalid frame rate');
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

  const [mb, { createCompositor }, { openVideoSource }, { MixdownFeeder, MixdownStream }] = await Promise.all([
    loadChunk(() => import('mediabunny')),
    loadChunk(() => import('../render/compositor')),
    loadChunk(() => import('../media/decode')),
    loadChunk(() => import('../audio/mixdown')),
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

    // The audio track must be declared before the output starts, so "has audio" is decided from the audible
    // clips up front; the mix itself is rendered window by window, interleaved with the frames below.
    const mix = new MixdownStream(p, AUDIO_SAMPLE_RATE, { signal });
    if (mix.audible) await ensureAacEncoder(mb, audioQuality, AUDIO_SAMPLE_RATE);
    checkAbort();

    const lutsSkipped = new Set<string>();
    const onLutUnavailable = (_id: Id, name: string): void => void lutsSkipped.add(name);
    compositor = createExportCompositor((c, o) => createCompositor(c, { ...o, onLutUnavailable }), width, height);
    const syncSources = (t: number): Promise<void> => syncExportSources(p, t, sources, openVideoSource, checkAbort);

    let target: InstanceType<typeof mb.StreamTarget> | InstanceType<typeof mb.BufferTarget>;
    if (hasOpfs()) {
      temp = await openTempFile();
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
    const audio = mix.audible ? new mb.AudioBufferSource({ codec: 'aac', quality: audioQuality }) : null;
    if (audio) output.addAudioTrack(audio);
    await output.start();

    const feeder = audio ? new MixdownFeeder(mix, Math.round(AUDIO_SLICE * AUDIO_SAMPLE_RATE)) : null;
    const audioShare = feeder ? AUDIO_SHARE : 0;
    const report = (framesDone: number): void => {
      const audioDone = feeder ? mix.rendered / mix.length : 0;
      progress(FRAMES_SHARE * ((1 - audioShare) * (framesDone / frameCount) + audioShare * audioDone));
    };
    const feedAudioUntil = async (seconds: number): Promise<void> => {
      if (!feeder || !audio) return;
      await feeder.feedUntil(seconds, (b) => audio.add(b));
      checkAbort();
    };

    for (let n = 0; n < frameCount; n++) {
      checkAbort();
      const t = n / fps;
      // Keep audio a slice ahead of the video so the muxer can interleave without buffering a whole track.
      await feedAudioUntil(t + AUDIO_SLICE);
      report(n);
      await syncSources(t);
      await compositor.renderFrame(p, t, sources);
      await video.add(t, 1 / fps);
      report(n + 1);
    }
    checkAbort();
    await feedAudioUntil(Infinity);
    checkAbort();

    await output.finalize();

    let blob: Blob;
    if (temp) {
      // Wrapping the OPFS-backed File only references it (no copy) and gives the Blob an MP4 type.
      blob = new Blob([await temp.handle.getFile()], { type: 'video/mp4' });
      rememberTempName(blob, temp.name);
    } else {
      const buffer = (target as InstanceType<typeof mb.BufferTarget>).buffer;
      if (!buffer) throw new ExportError('Export produced no data');
      blob = new Blob([buffer], { type: 'video/mp4' });
    }
    const skips: ExportSkips = { effects: skippedEffectTypes(p, compositor.unavailableTypes()), luts: [...lutsSkipped] };
    if (skips.effects.length > 0 || skips.luts.length > 0) opts.onSkipped?.(skips);
    progress(1);
    return blob;
  } catch (e) {
    if (output) await output.cancel().catch(() => undefined);
    if (temp) await discardTempFile(temp);
    if (signal.aborted) throw abortError();
    throw e;
  } finally {
    compositor?.dispose();
    for (const s of sources.values()) s.close();
  }
}
