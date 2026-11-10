// The user-facing import error messages (pure; no Mediabunny), so their wording and choice can be unit-tested.
import type { FileKind } from './fileKind';
import { imageLabel, withArticle } from './fileKind';

/** Import failure; `message` is shown to the user. */
export class ImportError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportError';
  }
}

export const damaged = (name: string): ImportError =>
  new ImportError(`Could not read ${name}: the file looks damaged or incomplete.`);
export const noContent = (name: string): ImportError => new ImportError(`${name} has no playable content.`);

const CONTAINER_NAME: Record<string, string> = {
  AVI: 'Audio Video Interleave',
  WMV: 'Windows Media Video',
  ASF: 'Windows Media',
  WMA: 'Windows Media Audio',
  FLV: 'Flash Video',
  MPEG: 'MPEG-1/2 video',
  VOB: 'DVD video',
};

/** A file whose container Mediabunny could not read, by what its name/MIME type claimed it to be. */
export function unreadable(name: string, claimed: FileKind | null): ImportError {
  if (claimed?.kind === 'av') return damaged(name);
  if (claimed?.kind === 'unsupported-av') {
    const full = CONTAINER_NAME[claimed.label];
    const what = `${withArticle(claimed.label)} file${full ? ` (${full})` : ''}`;
    return new ImportError(`${name} is ${what}, which ClipForge can't open. Convert it to MP4 first.`);
  }
  return new ImportError(`Unsupported file type: ${name}`);
}

/**
 * A readable container with no audio or video track: with other tracks (subtitles, data) it has nothing to play;
 * with no tracks at all it was almost always cut short (e.g. an MP4 missing its moov box).
 */
export function withoutAudioOrVideo(name: string, trackCount: number): ImportError {
  return trackCount > 0 ? noContent(name) : damaged(name);
}

/** An image the browser could not decode, worded by its claimed `format`. */
export function undecodableImage(name: string, format: string): ImportError {
  if (format === 'jpeg' || format === 'png') return damaged(name);
  if (format === 'heic') {
    return new ImportError(
      `${name} is a HEIC photo, which browsers can't decode. Export it as JPEG or PNG first ` +
        '(on iPhone: Settings → Camera → Formats → Most Compatible).',
    );
  }
  return new ImportError(
    `${name} is ${withArticle(imageLabel(format, name))} image, which can't be decoded by your browser. ` +
      'Export it as JPEG or PNG first.',
  );
}
