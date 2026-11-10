import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { InputAudioTrack, InputVideoTrack } from 'mediabunny';
import { fitTransform } from '../core/merge';
import { defaultTransform, newId } from '../core/model';
import type { Clip, Id, MediaRef } from '../core/model';
import { putMedia } from './storage';

/** Import failure; `message` is shown to the user. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

const IMAGE_DURATION = 5;
const DEFAULT_FPS = 30;
const IMAGE_MIME = new Set(['image/jpeg', 'image/png']);
const IMAGE_EXT = /\.(jpe?g|png)$/i;

type Probed = Omit<MediaRef, 'id' | 'name'>;

function undecodable(codec: string | null): ImportError {
  if (codec === 'hevc') {
    return new ImportError(
      'This file uses a codec your browser cannot decode (HEVC). Try Safari, or set iPhone Camera to Most Compatible.',
    );
  }
  return new ImportError(
    `This file uses a codec your browser cannot decode (${codec ?? 'unknown codec'}). Try converting it to an H.264 MP4.`,
  );
}

async function assertDecodable(track: InputVideoTrack | InputAudioTrack): Promise<void> {
  if (!(await track.canDecode())) throw undecodable(track.codec);
}

async function estimateFps(video: InputVideoTrack): Promise<number> {
  try {
    const { averagePacketRate } = await video.computePacketStats(100);
    return Number.isFinite(averagePacketRate) && averagePacketRate > 0 ? averagePacketRate : DEFAULT_FPS;
  } catch {
    return DEFAULT_FPS;
  }
}

/** Probes the container with Mediabunny; returns null when it is not a readable audio/video file. */
async function probeContainer(file: File): Promise<Probed | null> {
  const input = new Input({ source: new BlobSource(file), formats: ALL_FORMATS });
  try {
    let readable = false;
    try {
      readable = await input.canRead();
    } catch {
      readable = false;
    }
    if (!readable) return null;
    const video = await input.getPrimaryVideoTrack();
    const audio = await input.getPrimaryAudioTrack();
    if (video) {
      await assertDecodable(video);
      if (audio) await assertDecodable(audio);
      return {
        kind: 'video',
        duration: await input.computeDuration(),
        width: video.displayWidth,
        height: video.displayHeight,
        fps: await estimateFps(video),
        hasAudio: audio !== null,
      };
    }
    if (audio) {
      await assertDecodable(audio);
      return { kind: 'audio', duration: await input.computeDuration(), hasAudio: true };
    }
    return null;
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError(`Could not read ${file.name}: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    input.dispose();
  }
}

async function probeImage(file: File): Promise<Probed> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new ImportError(`Could not read image ${file.name}`);
  }
  const { width, height } = bitmap;
  bitmap.close();
  return { kind: 'image', duration: IMAGE_DURATION, width, height, hasAudio: false };
}

function looksLikeImage(file: File): boolean {
  return IMAGE_MIME.has(file.type) || IMAGE_EXT.test(file.name);
}

/** Probes `file`, then stores it in OPFS under a new media id. Nothing is stored if probing fails. */
export async function importFile(file: File): Promise<MediaRef> {
  let probed = await probeContainer(file);
  if (!probed) {
    if (!looksLikeImage(file)) throw new ImportError(`Unsupported file type: ${file.name}`);
    probed = await probeImage(file);
  }
  const id = newId();
  await putMedia(id, file);
  return { id, name: file.name, ...probed };
}

/** A clip spanning the whole media, fitted to the canvas. Track placement is the caller's job. */
export function clipFromMedia(
  m: MediaRef,
  _trackId: Id,
  start: number,
  canvas: { width: number; height: number },
): Clip {
  const transform =
    m.kind !== 'audio' && m.width && m.height
      ? fitTransform({ width: m.width, height: m.height }, canvas, 'fit')
      : defaultTransform();
  return {
    id: newId(),
    mediaId: m.id,
    kind: m.kind,
    start,
    in: 0,
    out: m.duration,
    transform,
    volume: 1,
    fit: 'fit',
  };
}
