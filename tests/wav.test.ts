import { describe, expect, it } from 'vitest';
import { encodeWav } from '../src/media/wav';

async function bytes(blob: Blob): Promise<DataView> {
  return new DataView(await blob.arrayBuffer());
}

const ascii = (v: DataView, at: number, n: number): string =>
  String.fromCharCode(...Array.from({ length: n }, (_, i) => v.getUint8(at + i)));

function samples(v: DataView): number[] {
  return Array.from({ length: (v.byteLength - 44) / 2 }, (_, i) => v.getInt16(44 + 2 * i, true));
}

describe('encodeWav', () => {
  it('writes a 44-byte mono 16-bit PCM RIFF header', async () => {
    const blob = encodeWav([new Float32Array([0, 1, -1])], 48000);
    expect(blob.type).toBe('audio/wav');
    const v = await bytes(blob);
    expect(v.byteLength).toBe(44 + 6);
    expect(ascii(v, 0, 4)).toBe('RIFF');
    expect(v.getUint32(4, true)).toBe(36 + 6);
    expect(ascii(v, 8, 4)).toBe('WAVE');
    expect(ascii(v, 12, 4)).toBe('fmt ');
    expect(v.getUint32(16, true)).toBe(16);
    expect(v.getUint16(20, true)).toBe(1); // PCM
    expect(v.getUint16(22, true)).toBe(1); // mono
    expect(v.getUint32(24, true)).toBe(48000);
    expect(v.getUint32(28, true)).toBe(96000); // byte rate
    expect(v.getUint16(32, true)).toBe(2); // block align
    expect(v.getUint16(34, true)).toBe(16);
    expect(ascii(v, 36, 4)).toBe('data');
    expect(v.getUint32(40, true)).toBe(6);
    expect(samples(v)).toEqual([0, 32767, -32768]);
  });

  it('clips to ±1, rounds toward zero and joins chunks in order', async () => {
    const v = await bytes(encodeWav([new Float32Array([2, -3]), new Float32Array([0.5, -0.5, 1e-6, NaN])], 44100));
    expect(v.getUint32(24, true)).toBe(44100);
    expect(v.getUint32(28, true)).toBe(88200);
    expect(v.getUint32(40, true)).toBe(12);
    expect(samples(v)).toEqual([32767, -32768, 16383, -16384, 0, 0]);
  });

  it('writes a valid empty data chunk for no samples', async () => {
    for (const chunks of [[], [new Float32Array(0)]]) {
      const v = await bytes(encodeWav(chunks, 48000));
      expect(v.byteLength).toBe(44);
      expect(v.getUint32(4, true)).toBe(36);
      expect(ascii(v, 36, 4)).toBe('data');
      expect(v.getUint32(40, true)).toBe(0);
    }
  });

  it('encodes uneven chunks exactly like one joined chunk', async () => {
    const all = Float32Array.from({ length: 1000 }, (_, i) => Math.sin(i / 7) * 1.2);
    const parts = [all.subarray(0, 1), all.subarray(1, 334), all.subarray(334, 335), all.subarray(335)];
    const a = new Uint8Array(await encodeWav(parts, 22050).arrayBuffer());
    const b = new Uint8Array(await encodeWav([all], 22050).arrayBuffer());
    expect(a.length).toBe(44 + 2000);
    expect(a).toEqual(b);
  });
});
