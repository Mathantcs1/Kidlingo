import { describe, it, expect, vi } from 'vitest';

const decode = vi.fn(async () => {
  throw new Error('probe decode failed');
});
vi.mock('../src/media/audioDecode', () => ({ decodeAudioRange: decode }));

const { clipNoiseProfile, prepareSource } = await import('../src/audio/denoiseSource');
const { defaultClipAudio } = await import('../src/core/model');
type Clip = import('../src/core/model').Clip;

const clip = (id: string): Clip => ({
  id,
  mediaId: `m-${id}`,
  kind: 'audio',
  start: 0,
  in: 0,
  out: 2,
  volume: 1,
  audio: { ...defaultClipAudio(), effects: [{ id: 'd', type: 'denoise', enabled: true, params: { strength: 0.8 } }] },
  fit: 'fit',
  transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
});

describe('a failed noise-profile probe decode', () => {
  it('degrades to pass-through (no exception) and is cached: the decoder is asked once across two windows', async () => {
    decode.mockClear();
    const c = clip('a');
    const buffer = { length: 96000, numberOfChannels: 1, sampleRate: 48000 } as unknown as AudioBuffer;
    const ctx = {} as BaseAudioContext;
    const first = await prepareSource(c, { buffer, start: 0 }, ctx);
    const second = await prepareSource(c, { buffer, start: 1 }, ctx);
    expect(first).toBe(buffer);
    expect(second).toBe(buffer);
    expect(decode).toHaveBeenCalledTimes(1);
    await expect(clipNoiseProfile(c, ctx)).resolves.toBeNull();
    expect(decode).toHaveBeenCalledTimes(1);
  });
});
