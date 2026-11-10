import { describe, it, expect } from 'vitest';
import { classifyFile } from '../src/media/fileKind';

describe('classifyFile', () => {
  it.each(['a.mp4', 'a.M4V', 'a.mov', 'a.webm', 'a.mkv', 'a.mp3', 'a.wav', 'a.m4a', 'a.aac', 'a.ogg', 'a.opus', 'a.flac'])(
    '%s is audio/video',
    (name) => {
      expect(classifyFile(name, '')).toEqual({ kind: 'av' });
    },
  );

  it.each([
    ['a.jpg', 'jpeg'],
    ['a.JPEG', 'jpeg'],
    ['a.png', 'png'],
    ['IMG_0001.HEIC', 'heic'],
    ['a.heif', 'heic'],
    ['a.webp', 'webp'],
    ['a.gif', 'gif'],
    ['a.avif', 'avif'],
    ['a.tif', 'tiff'],
    ['a.tiff', 'tiff'],
    ['a.bmp', 'bmp'],
  ])('%s is an image (%s)', (name, format) => {
    expect(classifyFile(name, '')).toEqual({ kind: 'image', format });
  });

  it('uses the MIME type when it names audio, video or an image', () => {
    expect(classifyFile('clip', 'video/quicktime')).toEqual({ kind: 'av' });
    expect(classifyFile('song', 'audio/mpeg')).toEqual({ kind: 'av' });
    expect(classifyFile('photo', 'image/heic')).toEqual({ kind: 'image', format: 'heic' });
    expect(classifyFile('photo', 'image/jpeg')).toEqual({ kind: 'image', format: 'jpeg' });
    expect(classifyFile('photo.png', 'image/svg+xml')).toEqual({ kind: 'image', format: 'svg' });
  });

  it('falls back to the extension for generic or empty MIME types', () => {
    expect(classifyFile('a.mp4', 'application/octet-stream')).toEqual({ kind: 'av' });
    expect(classifyFile('a.heic', '')).toEqual({ kind: 'image', format: 'heic' });
  });

  it('returns null for unknown types', () => {
    expect(classifyFile('notes.txt', 'text/plain')).toBeNull();
    expect(classifyFile('archive.zip', '')).toBeNull();
    expect(classifyFile('noext', '')).toBeNull();
    expect(classifyFile('mp4', '')).toBeNull();
  });
});
