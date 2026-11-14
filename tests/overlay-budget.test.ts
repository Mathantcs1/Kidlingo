// Plan 5B Task 10 (deferred from Task 6): ONE total byte budget for the overlay textures drawn in a frame. Without it N
// overlays each capped at 2048² cost N × 16 MiB (plus the same again in scratch canvases). Past the budget the textures
// drawn LATER in the frame are downscaled (sharpness only, never position or size on screen), deterministic for a given
// draw order; below it nothing changes (5A and 5B textures byte for byte).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newOverlayClip, overlayBaseSize } from '../src/core/overlays';
import type { Clip } from '../src/core/model';
import { OVERLAY_BYTE_BUDGET, OverlayTextures, overlayTextureSize } from '../src/render/overlays/textures';
import { fakeGl } from './fake-gl';

vi.mock('../src/render/overlays/draw', async (orig) => ({ ...(await orig<typeof import('../src/render/overlays/draw')>()), drawOverlay: vi.fn() }));

const FORMAT = { width: 1920, height: 1080, fps: 30 };
const MIB = 2 ** 20;

beforeEach(() => {
  vi.stubGlobal('OffscreenCanvas', class { width = 1; height = 1; getContext() { return {}; } });
});
afterEach(() => vi.unstubAllGlobals());

const sticker = (i: number): Clip => ({ ...newOverlayClip('sticker', 0, 5, FORMAT), id: `s${i}` });

/** One frame: every clip asked for at `scale`; returns the texture sizes handed out. */
function frame(tex: OverlayTextures, clips: Clip[], scale: number): { width: number; height: number }[] {
  tex.beginFrame();
  const out = clips.map((c) => tex.get(c, FORMAT, 1, 30, 1, scale)!.texels);
  tex.prune(new Set(clips.map((c) => c.id)));
  return out;
}

describe('overlay texture byte budget', () => {
  it('the default budget is 128 MiB and a single capped texture (16 MiB) fits many times', () => {
    expect(OVERLAY_BYTE_BUDGET).toBe(128 * MIB);
  });

  it('below the budget the sizes are exactly overlayTextureSize (nothing changes)', () => {
    const { gl } = fakeGl();
    const tex = new OverlayTextures(gl);
    const clips = [sticker(0), sticker(1), sticker(2)];
    const got = frame(tex, clips, 3);
    const want = overlayTextureSize(overlayBaseSize('sticker', FORMAT), 3, 1, 2048);
    for (const g of got) expect(g).toEqual(want);
    expect(tex.bytes).toBe(got.reduce((s, g) => s + g.width * g.height * 4, 0));
  });

  it('many capped overlays never exceed the budget: later textures shrink, earlier ones keep their size', () => {
    const { gl } = fakeGl();
    const budget = 24 * MIB;
    const tex = new OverlayTextures(gl, budget);
    const clips = Array.from({ length: 40 }, (_, i) => sticker(i));
    const got = frame(tex, clips, 40); // every sticker wants the 2048 cap (16 MiB)
    expect(got[0].width).toBe(2048);
    expect(tex.count).toBe(40);
    expect(tex.bytes).toBeLessThanOrEqual(budget + 4 * clips.length); // the 1×1 floor: 4 bytes per late overlay
    // The first fits whole; the second gets what is left (8 MiB); the rest get the 1×1 floor (4 bytes each).
    expect(got[1].width * got[1].height * 4).toBeLessThanOrEqual(8 * MIB);
    expect(got[1].width).toBeLessThan(got[0].width);
    expect(got.slice(2).every((g) => g.width >= 1 && g.height >= 1)).toBe(true);
    // Aspect ratio is kept while shrinking (the picture is scaled, not distorted).
    expect(Math.abs(got[1].width / got[1].height - got[0].width / got[0].height)).toBeLessThan(0.05);
  });

  it('the same draw order gives the same sizes every frame, and the counter restarts each frame (no creeping shrink)', () => {
    const { gl } = fakeGl();
    const tex = new OverlayTextures(gl, 24 * MIB);
    const clips = Array.from({ length: 6 }, (_, i) => sticker(i));
    const first = frame(tex, clips, 40);
    const uploads = tex.uploads;
    for (let i = 0; i < 5; i++) expect(frame(tex, clips, 40)).toEqual(first);
    expect(tex.uploads).toBe(uploads); // sizes stable: nothing re-uploaded
    // An aborted frame (an exception between beginFrame and prune) does not poison the next one.
    tex.beginFrame();
    tex.get(clips[0], FORMAT, 1, 30, 1, 40);
    expect(frame(tex, clips, 40)).toEqual(first);
  });

  it('a smaller overlay set after a large one gets full-size textures again (the budget is per frame)', () => {
    const { gl } = fakeGl();
    const tex = new OverlayTextures(gl, 24 * MIB);
    const many = Array.from({ length: 10 }, (_, i) => sticker(i));
    frame(tex, many, 40);
    expect(frame(tex, [many[3]], 40)[0].width).toBe(2048);
  });
});
