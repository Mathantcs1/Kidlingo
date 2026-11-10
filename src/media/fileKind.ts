// Pure file-type guess from a file's name and MIME type, used to word import errors (no decoding here).

export type FileKind = { kind: 'av' } | { kind: 'image'; format: string };

const AV_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac']);
const IMAGE_EXT: Record<string, string> = {
  jpg: 'jpeg',
  jpeg: 'jpeg',
  png: 'png',
  heic: 'heic',
  heif: 'heic',
  webp: 'webp',
  gif: 'gif',
  avif: 'avif',
  tif: 'tiff',
  tiff: 'tiff',
  bmp: 'bmp',
};

function fromMime(mime: string): FileKind | null {
  const [type, sub = ''] = mime.toLowerCase().split('/');
  if (type === 'video' || type === 'audio') return { kind: 'av' };
  if (type !== 'image' || !sub) return null;
  const format = sub.replace(/^x-/, '').replace(/\+.*$/, '');
  return { kind: 'image', format: IMAGE_EXT[format] ?? format };
}

function fromName(name: string): FileKind | null {
  const dot = name.lastIndexOf('.');
  if (dot <= 0) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  if (AV_EXT.has(ext)) return { kind: 'av' };
  const format = IMAGE_EXT[ext];
  return format ? { kind: 'image', format } : null;
}

/** What `name`/`mime` claim to be: audio/video, an image (with its format), or null when unknown. */
export function classifyFile(name: string, mime: string): FileKind | null {
  return fromMime(mime) ?? fromName(name);
}
