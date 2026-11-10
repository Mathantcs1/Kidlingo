import { describe, it, expect } from 'vitest';
import { hasWebCodecs } from '../src/media/support';

describe('hasWebCodecs', () => {
  it('is false when the WebCodecs constructors are missing', () => {
    expect(hasWebCodecs({} as unknown as typeof globalThis)).toBe(false);
  });

  it('is false when only one of decoder/encoder exists', () => {
    expect(hasWebCodecs({ VideoDecoder: class {} } as unknown as typeof globalThis)).toBe(false);
    expect(hasWebCodecs({ VideoEncoder: class {} } as unknown as typeof globalThis)).toBe(false);
  });

  it('is true when VideoDecoder and VideoEncoder exist', () => {
    const g = { VideoDecoder: class {}, VideoEncoder: class {} } as unknown as typeof globalThis;
    expect(hasWebCodecs(g)).toBe(true);
  });
});
