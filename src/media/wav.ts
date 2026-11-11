// Mono 16-bit PCM WAV writer for voice-over recordings (pure; no DOM beyond Blob).

const HEADER = 44;

function writeAscii(v: DataView, at: number, s: string): void {
  for (let i = 0; i < s.length; i++) v.setUint8(at + i, s.charCodeAt(i));
}

/**
 * Float sample → int16. Clipped to ±1 first (NaN becomes 0); negative values scale by 32768 and positive ones by
 * 32767 so both ends are reachable (−1 → −32768, 1 → 32767), then rounded toward zero (Math.trunc).
 */
function toInt16(x: number): number {
  const c = x > 1 ? 1 : x < -1 ? -1 : x === x ? x : 0;
  return Math.trunc(c < 0 ? c * 32768 : c * 32767);
}

/** The 44-byte RIFF/WAVE header for `count` mono 16-bit samples. */
function wavHeader(count: number, sampleRate: number): ArrayBuffer {
  const dataBytes = count * 2;
  const v = new DataView(new ArrayBuffer(HEADER));
  writeAscii(v, 0, 'RIFF');
  v.setUint32(4, 36 + dataBytes, true);
  writeAscii(v, 8, 'WAVE');
  writeAscii(v, 12, 'fmt ');
  v.setUint32(16, 16, true); // fmt chunk size
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, sampleRate, true);
  v.setUint32(28, sampleRate * 2, true); // byte rate
  v.setUint16(32, 2, true); // block align
  v.setUint16(34, 16, true); // bits per sample
  writeAscii(v, 36, 'data');
  v.setUint32(40, dataBytes, true);
  return v.buffer;
}

/** One chunk as little-endian int16 PCM bytes. */
export function pcm16(chunk: Float32Array): ArrayBuffer {
  const v = new DataView(new ArrayBuffer(chunk.length * 2));
  for (let i = 0; i < chunk.length; i++) v.setInt16(2 * i, toInt16(chunk[i]), true);
  return v.buffer;
}

/** A WAV Blob from PCM parts (from `pcm16`) holding `count` samples in all. */
export function wavBlob(parts: ArrayBuffer[], count: number, sampleRate: number): Blob {
  return new Blob([wavHeader(count, sampleRate), ...parts], { type: 'audio/wav' });
}

/** Encodes `chunks` (played back to back) as a mono 16-bit PCM WAV file with a 44-byte RIFF header. */
export function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const count = chunks.reduce((n, c) => n + c.length, 0);
  return wavBlob(chunks.map(pcm16), count, sampleRate);
}
