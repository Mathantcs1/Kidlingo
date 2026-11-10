import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/media/fileKind';
import { undecodableImage, unreadable, withoutAudioOrVideo } from '../src/media/importErrors';

const msg = (e: Error): string => e.message;

describe('unreadable container wording', () => {
  it('a supported container that cannot be read is damaged', () => {
    expect(msg(unreadable('cut.mp4', classifyFile('cut.mp4', 'video/mp4')))).toBe(
      'Could not read cut.mp4: the file looks damaged or incomplete.',
    );
  });

  it('a known container ClipForge cannot open says so, never "damaged"', () => {
    expect(msg(unreadable('old.avi', classifyFile('old.avi', 'video/x-msvideo')))).toBe(
      "old.avi is an AVI file (Audio Video Interleave), which ClipForge can't open. Convert it to MP4 first.",
    );
    expect(msg(unreadable('x', classifyFile('x', 'video/x-ms-wmv')))).toBe(
      "x is a WMV file (Windows Media Video), which ClipForge can't open. Convert it to MP4 first.",
    );
    expect(msg(unreadable('a.rm', classifyFile('a.rm', '')))).toBe(
      "a.rm is a RealMedia file, which ClipForge can't open. Convert it to MP4 first.",
    );
  });

  it('unknown types are unsupported', () => {
    expect(msg(unreadable('notes.txt', classifyFile('notes.txt', 'text/plain')))).toBe('Unsupported file type: notes.txt');
  });
});

describe('withoutAudioOrVideo', () => {
  it('other tracks only (subtitles/data) means nothing to play; no tracks at all means cut short', () => {
    expect(msg(withoutAudioOrVideo('subs.mp4', 1))).toBe('subs.mp4 has no playable content.');
    expect(msg(withoutAudioOrVideo('cut.mp4', 0))).toBe('Could not read cut.mp4: the file looks damaged or incomplete.');
  });
});

describe('undecodableImage', () => {
  it('names the format properly with the right article', () => {
    expect(msg(undecodableImage('logo.svg', 'svg'))).toBe(
      "logo.svg is an SVG image, which can't be decoded by your browser. Export it as JPEG or PNG first.",
    );
    expect(msg(undecodableImage('favicon.ico', 'icon'))).toMatch(/^favicon\.ico is an ICO image,/);
    expect(msg(undecodableImage('scan.tif', 'tiff'))).toMatch(/^scan\.tif is a TIFF image,/);
    expect(msg(undecodableImage('anim.webp', 'webp'))).toMatch(/^anim\.webp is a WebP image,/);
    expect(msg(undecodableImage('p.pcx', 'x-pcx'))).toMatch(/^p\.pcx is a PCX image,/);
    expect(msg(undecodableImage('broken.jpg', 'jpeg'))).toBe('Could not read broken.jpg: the file looks damaged or incomplete.');
  });
});
