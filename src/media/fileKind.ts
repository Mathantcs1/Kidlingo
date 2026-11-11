// Pure file-type guess from a file's name and MIME type, used to word import errors (no decoding here).

/**
 * 'av': a container Mediabunny reads; 'image': an image of `format`; 'unsupported-av': a known audio/video
 * container ClipForge cannot open (`label` names it, e.g. 'AVI'); 'lut': a `.cube` colour LUT (by extension only).
 */
export type FileKind =
  | { kind: 'av' }
  | { kind: 'image'; format: string }
  | { kind: 'unsupported-av'; label: string }
  | { kind: 'lut' };

const AV_EXT = new Set(['mp4', 'm4v', 'mov', 'webm', 'mkv', 'mts', 'm2ts', 'mp3', 'wav', 'm4a', 'aac', 'ogg', 'oga', 'opus', 'flac']);
const AV_MIME = new Set([
  'video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska', 'video/mp2t', 'video/ogg',
  'audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave', 'audio/ogg',
  'audio/flac', 'audio/x-flac', 'audio/opus', 'audio/webm',
]);
const UNSUPPORTED_EXT: Record<string, string> = {
  avi: 'AVI',
  divx: 'AVI',
  wmv: 'WMV',
  asf: 'ASF',
  wma: 'WMA',
  flv: 'FLV',
  mpg: 'MPEG',
  mpeg: 'MPEG',
  vob: 'VOB',
  rm: 'RealMedia',
  rmvb: 'RealMedia',
};
const UNSUPPORTED_MIME: Record<string, string> = {
  'video/x-msvideo': 'AVI',
  'video/avi': 'AVI',
  'video/msvideo': 'AVI',
  'video/x-ms-wmv': 'WMV',
  'video/x-ms-asf': 'ASF',
  'audio/x-ms-wma': 'WMA',
  'video/x-flv': 'FLV',
  'video/mpeg': 'MPEG',
  'application/vnd.rn-realmedia': 'RealMedia',
};
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
/** How image formats are named to the user. */
const IMAGE_LABEL: Record<string, string> = {
  jpeg: 'JPEG',
  png: 'PNG',
  heic: 'HEIC',
  webp: 'WebP',
  gif: 'GIF',
  avif: 'AVIF',
  tiff: 'TIFF',
  bmp: 'BMP',
  svg: 'SVG',
  icon: 'ICO',
  ico: 'ICO',
  'vnd.microsoft.icon': 'ICO',
  jxl: 'JPEG XL',
};

function extension(name: string): string | null {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : null;
}

function fromMime(mime: string): FileKind | null {
  const m = mime.toLowerCase();
  if (AV_MIME.has(m)) return { kind: 'av' };
  if (UNSUPPORTED_MIME[m]) return { kind: 'unsupported-av', label: UNSUPPORTED_MIME[m] };
  const [type, sub = ''] = m.split('/');
  // Other video/audio types say too little (could be anything); the extension decides.
  if (type !== 'image' || !sub) return null;
  const format = sub.replace(/^x-/, '').replace(/\+.*$/, '');
  return { kind: 'image', format: IMAGE_EXT[format] ?? format };
}

function fromName(name: string): FileKind | null {
  const ext = extension(name);
  if (!ext) return null;
  if (AV_EXT.has(ext)) return { kind: 'av' };
  if (UNSUPPORTED_EXT[ext]) return { kind: 'unsupported-av', label: UNSUPPORTED_EXT[ext] };
  const format = IMAGE_EXT[ext];
  return format ? { kind: 'image', format } : null;
}

/** What `name`/`mime` claim to be (see FileKind), or null when unknown. */
export function classifyFile(name: string, mime: string): FileKind | null {
  // .cube files arrive with no, a text or a generic MIME type: the extension decides.
  if (extension(name) === 'cube') return { kind: 'lut' };
  return fromMime(mime) ?? fromName(name);
}

/** The user-facing name of an image `format` (from classifyFile), else the file's extension, else the format, upper case. */
export function imageLabel(format: string, name: string): string {
  return IMAGE_LABEL[format] ?? extension(name)?.toUpperCase() ?? format.toUpperCase();
}

/** Letters whose spoken name starts with a vowel sound ("an SVG", "an MPEG", but "a WMV"). */
const VOWEL_SOUND_LETTERS = 'AEFHILMNORSX';

/** `label` with "a" or "an" in front; all-caps labels are read as spelled-out letters. */
export function withArticle(label: string): string {
  const acronym = label.length > 1 && label === label.toUpperCase();
  const vowel = acronym ? VOWEL_SOUND_LETTERS.includes(label.charAt(0)) : /^[aeiou]/i.test(label);
  return `${vowel ? 'an' : 'a'} ${label}`;
}
