import { describe, it, expect } from 'vitest';
import { classifyFile, imageLabel, withArticle } from '../src/media/fileKind';

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

  it.each([
    'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/mp2t', 'video/ogg',
    'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg',
    'audio/flac', 'audio/x-flac', 'audio/opus', 'audio/webm',
  ])('MIME %s is a supported container', (mime) => {
    expect(classifyFile('file', mime)).toEqual({ kind: 'av' });
  });

  it.each([
    ['clip', 'video/x-msvideo', 'AVI'],
    ['clip', 'video/avi', 'AVI'],
    ['clip', 'video/msvideo', 'AVI'],
    ['clip', 'video/x-ms-wmv', 'WMV'],
    ['clip', 'video/x-ms-asf', 'ASF'],
    ['clip', 'video/x-flv', 'FLV'],
    ['clip', 'video/mpeg', 'MPEG'],
    ['song', 'audio/x-ms-wma', 'WMA'],
    ['a.avi', '', 'AVI'],
    ['a.DIVX', '', 'AVI'],
    ['a.wmv', '', 'WMV'],
    ['a.asf', '', 'ASF'],
    ['a.wma', '', 'WMA'],
    ['a.flv', '', 'FLV'],
    ['a.mpg', '', 'MPEG'],
    ['a.mpeg', '', 'MPEG'],
    ['a.vob', '', 'VOB'],
    ['a.rm', '', 'RealMedia'],
    ['a.rmvb', '', 'RealMedia'],
  ])('%s (%s) is a known container ClipForge cannot open: %s', (name, mime, label) => {
    expect(classifyFile(name, mime)).toEqual({ kind: 'unsupported-av', label });
  });

  it('an unrecognised video/audio MIME type falls back to the extension', () => {
    expect(classifyFile('a.mp4', 'video/x-something')).toEqual({ kind: 'av' });
    expect(classifyFile('a.avi', 'video/x-something')).toEqual({ kind: 'unsupported-av', label: 'AVI' });
    expect(classifyFile('a.bin', 'video/x-something')).toBeNull();
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

describe('imageLabel / withArticle', () => {
  it.each([
    ['svg', 'a.svg', 'SVG'],
    ['icon', 'a.ico', 'ICO'],
    ['vnd.microsoft.icon', 'favicon', 'ICO'],
    ['webp', 'a.webp', 'WebP'],
    ['tiff', 'a.tif', 'TIFF'],
    ['jxl', 'a.jxl', 'JPEG XL'],
    ['x-weird', 'scan.pcx', 'PCX'],
    ['x-weird', 'noext', 'X-WEIRD'],
  ])('format %s of %s reads as %s', (format, name, label) => {
    expect(imageLabel(format, name)).toBe(label);
  });

  it.each([
    ['SVG', 'an SVG'],
    ['AVI', 'an AVI'],
    ['MPEG', 'an MPEG'],
    ['FLV', 'an FLV'],
    ['HEIC', 'an HEIC'],
    ['WMV', 'a WMV'],
    ['TIFF', 'a TIFF'],
    ['GIF', 'a GIF'],
    ['WebP', 'a WebP'],
    ['RealMedia', 'a RealMedia'],
    ['image', 'an image'],
  ])('%s -> %s', (label, want) => {
    expect(withArticle(label)).toBe(want);
  });
});
