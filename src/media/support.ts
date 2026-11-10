// Browser capability report: which of the APIs ClipForge relies on this browser provides.

export type Capability =
  | 'videoDecoder'
  | 'videoEncoder'
  | 'audioDecoder'
  | 'opfs'
  | 'opfsWritable'
  | 'webgl2'
  | 'offlineAudioContext';

export type Capabilities = Record<Capability, boolean>;

/** Human-readable names for the banner, in report order. */
export const CAPABILITY_LABELS: Record<Capability, string> = {
  videoDecoder: 'WebCodecs video decoding',
  videoEncoder: 'WebCodecs video encoding',
  audioDecoder: 'WebCodecs audio decoding',
  opfs: 'the Origin Private File System',
  opfsWritable: 'OPFS file writing',
  webgl2: 'WebGL2',
  offlineAudioContext: 'Web Audio offline rendering',
};

const ORDER = Object.keys(CAPABILITY_LABELS) as Capability[];

/** Without these nothing can be imported: probing decodes samples and the file is copied into OPFS. */
const IMPORT_NEEDS: Capability[] = ['videoDecoder', 'audioDecoder', 'opfs', 'opfsWritable'];

const isFn = (v: unknown): boolean => typeof v === 'function';

/** Pure over a global-like object, so it can be unit-tested with fakes. */
export function getCapabilities(g: typeof globalThis = globalThis): Capabilities {
  const any = g as unknown as Record<string, unknown>;
  const nav = any.navigator as { storage?: { getDirectory?: unknown } } | undefined;
  const handle = any.FileSystemFileHandle as { prototype?: { createWritable?: unknown } } | undefined;
  return {
    videoDecoder: 'VideoDecoder' in g,
    videoEncoder: 'VideoEncoder' in g,
    audioDecoder: 'AudioDecoder' in g,
    opfs: isFn(nav?.storage?.getDirectory),
    // Safari before 26 has OPFS but no createWritable() on the main thread, which storage and export need.
    opfsWritable: isFn(handle?.prototype?.createWritable),
    webgl2: 'WebGL2RenderingContext' in g,
    offlineAudioContext: 'OfflineAudioContext' in g,
  };
}

export function missingCapabilities(caps: Capabilities): Capability[] {
  return ORDER.filter((c) => !caps[c]);
}

/** The missing capabilities that make import impossible. */
export function importBlockers(caps: Capabilities): Capability[] {
  return IMPORT_NEEDS.filter((c) => !caps[c]);
}

/** True when the environment exposes the WebCodecs video decoder and encoder. */
export function hasWebCodecs(g: typeof globalThis = globalThis): boolean {
  return 'VideoDecoder' in g && 'VideoEncoder' in g;
}
