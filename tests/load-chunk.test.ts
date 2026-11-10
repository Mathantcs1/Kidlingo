import { describe, it, expect } from 'vitest';
import { CHUNK_OFFLINE_MESSAGE, CHUNK_RELOAD_MESSAGE, ChunkLoadError, chunkLoadMessage, isChunkLoadError, loadChunk } from '../src/loadChunk';

describe('isChunkLoadError', () => {
  it.each([
    ['Chromium', new TypeError('Failed to fetch dynamically imported module: https://x/assets/import-abc.js')],
    ['Safari', new TypeError('Importing a module script failed.')],
    ['Firefox', new TypeError('error loading dynamically imported module: https://x/assets/a.js')],
    [
      'a MIME error (index.html served for a missing chunk)',
      new TypeError("Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of \"text/html\"."),
    ],
    ['Vite preload', new Error('Unable to preload CSS for /assets/x.css')],
  ])('recognises the %s message', (_, e) => {
    expect(isChunkLoadError(e)).toBe(true);
  });

  it('ignores other errors', () => {
    expect(isChunkLoadError(new TypeError('x is not a function'))).toBe(false);
    expect(isChunkLoadError(new Error('WebGL2 is not available'))).toBe(false);
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false);
  });
});

describe('loadChunk', () => {
  it('passes the module through', async () => {
    await expect(loadChunk(async () => ({ a: 1 }))).resolves.toEqual({ a: 1 });
  });

  it('turns a chunk failure into ChunkLoadError asking for a reload', async () => {
    const run = loadChunk(() => Promise.reject(new TypeError('Failed to fetch dynamically imported module: /assets/a.js')));
    await expect(run).rejects.toBeInstanceOf(ChunkLoadError);
    await expect(run).rejects.toThrow(CHUNK_RELOAD_MESSAGE);
    expect(CHUNK_RELOAD_MESSAGE).toBe('ClipForge was updated — reload the page.');
  });

  it('rethrows other failures unchanged', async () => {
    const boom = new Error('boom');
    await expect(loadChunk(() => Promise.reject(boom))).rejects.toBe(boom);
  });
});

describe('chunkLoadMessage', () => {
  it('says the app was updated when online and that the user is offline otherwise', () => {
    expect(chunkLoadMessage(true)).toBe(CHUNK_RELOAD_MESSAGE);
    expect(chunkLoadMessage(false)).toBe(CHUNK_OFFLINE_MESSAGE);
    expect(CHUNK_OFFLINE_MESSAGE).toBe('You appear to be offline — reconnect and reload.');
    expect(new ChunkLoadError({ online: false }).message).toBe(CHUNK_OFFLINE_MESSAGE);
  });
});
