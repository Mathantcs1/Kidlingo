// Plan 5E Task 4: drawPicture hands the blur backdrop the CROPPED size and the quad the crop/anchor-aware matrix.
import { describe, it, expect, vi } from 'vitest';
import { defaultClipAudio, defaultTransform } from '../src/core/model';
import type { Clip } from '../src/core/model';
import type { Draw } from '../src/render/drawCollect';
import { drawPicture } from '../src/render/drawPicture';
import { clipMatrix, uvMatrix } from '../src/render/geometry';

const clip = (extra: Partial<Clip> = {}): Clip => ({
  id: 'c', mediaId: 'm', kind: 'image', start: 0, in: 0, out: 1, transform: { ...defaultTransform(), scale: 0.5, rotation: 20 }, volume: 1,
  fit: 'blur', audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const FORMAT = { width: 640, height: 360 };
const VIEWPORT = { x: 0, y: 0, width: 640, height: 360 };
const UV = uvMatrix(0);

function run(c: Clip) {
  const quad = { draw: vi.fn() };
  const blur = { draw: vi.fn() };
  const d = { clip: c, slot: { tex: {} as WebGLTexture, width: 100, height: 50 }, size: { width: 100, height: 50 }, uv: UV, texels: { width: 100, height: 50 } } as Draw;
  drawPicture(quad as never, blur as never, d, d.slot, UV, FORMAT, VIEWPORT, () => undefined);
  return { quad, blur };
}

describe('drawPicture', () => {
  it('without crop or anchor: full size to the blur, the 5B matrix to the quad', () => {
    const { quad, blur } = run(clip());
    expect(blur.draw.mock.calls[0][1]).toEqual({ width: 100, height: 50 });
    expect(quad.draw.mock.calls[0][1]).toEqual(clipMatrix({ width: 100, height: 50 }, clip().transform, FORMAT));
  });
  it('with a crop: the cropped size to the blur, the crop view to the quad', () => {
    const c = clip({ crop: { left: 0.5, top: 0, right: 0.25, bottom: 0.5 }, anchor: { x: 0.1, y: -0.2 } });
    const { quad, blur } = run(c);
    expect(blur.draw.mock.calls[0][1]).toEqual({ width: 25, height: 25 });
    expect(quad.draw.mock.calls[0][1]).toEqual(clipMatrix({ width: 100, height: 50 }, c.transform, FORMAT, { crop: c.crop, anchor: c.anchor }));
    expect(quad.draw.mock.calls[0][1]).not.toEqual(clipMatrix({ width: 100, height: 50 }, c.transform, FORMAT));
  });
  it('no blur for other fits', () => {
    expect(run(clip({ fit: 'fit' })).blur.draw).not.toHaveBeenCalled();
  });
});
