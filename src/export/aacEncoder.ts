// The export's AAC encoder (split out of exporter.ts): native when the browser has one, else the WASM encoder.
import { loadChunk } from '../loadChunk';

let aacEncoderRegistered = false;

/** Uses the native AAC encoder when available, otherwise registers the WASM one (loaded on demand). */
export async function ensureAacEncoder(
  mb: typeof import('mediabunny'), quality: InstanceType<typeof mb.Quality>, sampleRate: number,
): Promise<void> {
  if (aacEncoderRegistered) return;
  const native = await mb.canEncodeAudio('aac', { numberOfChannels: 2, sampleRate, quality });
  if (native) return;
  const { registerAacEncoder } = await loadChunk(() => import('@mediabunny/aac-encoder'));
  registerAacEncoder();
  aacEncoderRegistered = true;
}
