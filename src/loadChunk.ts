// Lazily loaded chunks (Mediabunny, decoders, compositor, mixer, AAC encoder) can disappear when a tab stays open
// across a redeploy: the old hashed file is gone. Such failures become one clear "reload" message.

export const CHUNK_RELOAD_MESSAGE = 'ClipForge was updated — reload the page.';

export class ChunkLoadError extends Error {
  constructor(options?: { cause?: unknown }) {
    super(CHUNK_RELOAD_MESSAGE, options);
    this.name = 'ChunkLoadError';
  }
}

// Chromium, Safari and Firefox wordings for a failed dynamic import, a module served with the wrong MIME type
// (an HTML page instead of the missing chunk), and Vite's CSS preload failure.
const PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Failed to load module script/i,
  /MIME type/i,
  /Unable to preload CSS/i,
];

export function isChunkLoadError(e: unknown): boolean {
  return e instanceof Error && PATTERNS.some((re) => re.test(e.message));
}

/** Runs a dynamic `import()`; a chunk-load failure rejects with ChunkLoadError, anything else unchanged. */
export async function loadChunk<T>(importer: () => Promise<T>): Promise<T> {
  try {
    return await importer();
  } catch (e) {
    if (isChunkLoadError(e)) throw new ChunkLoadError({ cause: e });
    throw e;
  }
}
