import { ALL_FORMATS, BlobSource, Input } from 'mediabunny';
import type { InputAudioTrack, InputVideoTrack } from 'mediabunny';
import { newId } from '../core/model';
import type { MediaRef } from '../core/model';
import { classifyFile } from './fileKind';
import { ImportError, damaged, noContent, undecodableImage, unreadable, withoutAudioOrVideo } from './importErrors';
import { importLut } from './lutImport';
import { putMedia } from './storage';

// Kept here for existing callers; lives in ./clip so the timeline can use it without loading Mediabunny.
export { clipFromMedia } from './clip';

export { ImportError } from './importErrors';

const IMAGE_DURATION = 5;
const DEFAULT_FPS = 30;

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

/**
 * Probes the container with Mediabunny; returns null when it is not a readable audio/video container. A readable
 * container without audio or video tracks, or one that fails part-way, throws an ImportError.
 */
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
    throw withoutAudioOrVideo(file.name, (await input.getTracks()).length);
  } catch (e) {
    if (e instanceof ImportError) throw e;
    console.error('clipforge: could not read', file.name, e);
    throw damaged(file.name);
  } finally {
    input.dispose();
  }
}

async function probeImage(file: File, format: string): Promise<Probed> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw undecodableImage(file.name, format);
  }
  const { width, height } = bitmap;
  bitmap.close();
  return { kind: 'image', duration: IMAGE_DURATION, width, height, hasAudio: false };
}

/**
 * Probes `file` (a .cube file is a LUT: see importLut), then stores it in OPFS under a new media id. Nothing is
 * stored if probing fails; the ImportError
 * says whether the file is of an unsupported type or container, damaged, an undecodable image format, or empty.
 */
export async function importFile(file: File): Promise<MediaRef> {
  const claimed = classifyFile(file.name, file.type);
  if (claimed?.kind === 'lut') return importLut(file);
  let probed: Probed | null;
  if (claimed?.kind === 'image') {
    probed = await probeImage(file, claimed.format);
  } else {
    probed = await probeContainer(file);
    // Known-unsupported containers are still tried: a misnamed but readable file imports fine.
    if (!probed) throw unreadable(file.name, claimed);
  }
  if (!(Number.isFinite(probed.duration) && probed.duration > 0)) throw noContent(file.name);
  const id = newId();
  await putMedia(id, file);
  return { id, name: file.name, ...probed };
}
