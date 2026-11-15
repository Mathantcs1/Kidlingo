import { VideoSampleSink } from 'mediabunny';
import type { Rotation } from 'mediabunny';
import type { Id } from '../core/model';
import { getMediaFile } from './storage';
import { DecodedVideoSource, openInput } from './videoSource';

/** Random access to the decoded frames of one media file's primary video track. */
export interface VideoSource {
  /**
   * Returns the frame shown at `sourceTime` seconds: the last frame whose timestamp is <= `sourceTime`
   * (the first frame for earlier times, the last frame for times beyond the end), or null when the media
   * has no video track.
   *
   * Ownership: the returned frame belongs to this source and is valid ONLY until the next `frameAt` call
   * or `close()`. Draw or upload it immediately; never close it or keep it.
   */
  frameAt(sourceTime: number): Promise<ImageBitmap | VideoFrame | null>;
  /**
   * Clockwise rotation (degrees) the track's metadata asks for. Frames from `frameAt` are NOT rotated: draw them
   * turned by this much (portrait phone videos are usually stored landscape with 90 or 270).
   */
  readonly rotation: Rotation;
  /** Whether the metadata asks for the frames to be mirrored horizontally (after `rotation`); not applied either. */
  readonly flip: boolean;
  /** Releases the decoders, cached frames and the underlying Input. Safe to call more than once. */
  close(): void;
}

export { resetVideoDecodeCount, resetVideoSourceStats, videoDecodeCount, videoSourceStats } from './videoSource';
export { resetReverseBytes, reverseBytes } from './reverseCache';

/** Opens the media's primary video track for frame access. Reads the file lazily; never loads it whole. */
export async function openVideoSource(mediaId: Id): Promise<VideoSource> {
  const input = openInput(await getMediaFile(mediaId));
  try {
    const track = await input.getPrimaryVideoTrack();
    if (!track) return new DecodedVideoSource(input, null, 0, 0, false);
    const first = await track.getFirstTimestamp();
    const [rotation, flip] = await Promise.all([track.getRotation(), track.getFlip()]);
    return new DecodedVideoSource(input, new VideoSampleSink(track), first, rotation, flip);
  } catch (e) {
    input.dispose();
    throw e;
  }
}

export { decodeAudio, decodeAudioRange } from './audioDecode';
export type { DecodedAudio } from './audioDecode';
