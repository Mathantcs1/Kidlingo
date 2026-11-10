// In-browser test harness (served at /harness.html by the dev server; not part of the app build).
import { hasWebCodecs } from './media/support';
import { getMediaFile, hasMedia, listMediaIds, putMedia, removeMedia } from './media/storage';
import { clipFromMedia, importFile } from './media/import';
import { decodeAudio, openVideoSource } from './media/decode';
import type { MediaRef } from './core/model';

const cf = {
  importFile,
  putMedia,
  getMediaFile,
  hasMedia,
  removeMedia,
  listMediaIds,
  clipFromMedia,
  hasWebCodecs,
  openVideoSource,
  decodeAudio,
  /** A context for `decodeAudio` to create AudioBuffers with (it is never rendered). */
  newAudioContext(sampleRate = 48000): BaseAudioContext {
    return new OfflineAudioContext(2, 48000, sampleRate);
  },
  /** Imports the Nth file currently selected in `#harness-file`. */
  importInputFile(index: number): Promise<MediaRef> {
    const input = document.getElementById('harness-file') as HTMLInputElement | null;
    const file = input?.files?.[index];
    if (!file) return Promise.reject(new Error(`No file selected at index ${index}`));
    return importFile(file);
  },
};

declare global {
  interface Window {
    cf: typeof cf;
  }
}

window.cf = cf;
