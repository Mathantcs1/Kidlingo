// Plan 5 Task 5: collectDraws resolves every visible clip ONCE per frame (D7), so every Draw/AdjustmentDraw carries the
// clip as seen at t; static clips pass through as the same object; hidden tracks are never resolved; overlay textures
// are sized from the clip's maximum scale, not the per-frame one.
import { describe, it, expect, vi, beforeEach } from 'vitest';

const calls: string[] = [];
vi.mock('../src/core/animate', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/core/animate')>();
  return {
    ...actual,
    resolveClip: (clip: import('../src/core/model').Clip, t: number, format: import('../src/core/animate').ResolveFormat) => {
      calls.push(clip.id);
      return actual.resolveClip(clip, t, format);
    },
  };
});

import { collectDraws, isAdjustmentDraw } from '../src/render/drawCollect';
import type { DrawContext, FrameDraw } from '../src/render/drawCollect';
import { defaultClipAudio, newTrack } from '../src/core/model';
import type { Clip, Keyframe, MediaRef, Project, Track } from '../src/core/model';
import type { VideoSource } from '../src/media/decode';
import { CURRENT_VERSION } from './helpers/project';

const lin = { kind: 'linear' as const };
const k = (t: number, v: number): Keyframe => ({ t, v, ease: lin });

function clip(id: string, extra: Partial<Clip> = {}): Clip {
  return {
    id, mediaId: '', kind: 'adjustment', start: 0, in: 0, out: 2, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    volume: 1, fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
  };
}

const IMG: MediaRef = { id: 'img', name: 'i.png', kind: 'image', duration: 5, width: 40, height: 20, hasAudio: false };
const VID: MediaRef = { id: 'vid', name: 'v.mp4', kind: 'video', duration: 5, width: 40, height: 20, hasAudio: false };

function project(layers: Clip[][], hidden: number[] = []): Project {
  const tracks: Track[] = layers.map((clips, i) => ({ ...newTrack('video'), id: `v${i}`, hidden: hidden.includes(i), clips }));
  return { version: CURRENT_VERSION, format: { width: 320, height: 180, fps: 30 }, tracks, media: { img: IMG, vid: VID } };
}

/** A GL stand-in whose every method is a no-op returning an empty object (textures are opaque handles here). */
const fakeGl = new Proxy({}, { get: () => () => ({}) }) as unknown as WebGL2RenderingContext;

function context(overlayCalls: unknown[][]): DrawContext {
  const slot = { tex: {} as WebGLTexture, width: 40, height: 20 };
  return {
    gl: fakeGl,
    images: { get: async () => slot, prune: () => undefined } as unknown as DrawContext['images'],
    overlays: {
      get: (...args: unknown[]) => {
        overlayCalls.push(args);
        return { slot, size: { width: 54, height: 54 }, texels: { width: 54, height: 54 } };
      },
      prune: () => undefined,
    } as unknown as DrawContext['overlays'],
    pixelScale: () => 1,
    videoSlots: new Map(),
    assertUsable: () => undefined,
    isLive: () => true,
  };
}

const source = { rotation: 0, flip: false, frameAt: async () => ({ width: 40, height: 20 }) } as unknown as VideoSource;

async function collect(p: Project, t: number, overlayCalls: unknown[][] = []): Promise<FrameDraw[]> {
  return collectDraws(context(overlayCalls), p, t, new Map([['vid', source]]));
}

beforeEach(() => {
  calls.length = 0;
});

describe('collectDraws resolves clips once per frame', () => {
  it('every kind of draw carries the resolved clip (transform and effect params at t)', async () => {
    const keys = { opacity: [k(0, 0), k(1, 1)], scale: [k(0, 1), k(1, 3)] };
    const fx = { id: 'e', type: 'invert' as const, enabled: true, params: { amount: 1 }, keys: { amount: [k(0, 0), k(1, 1)] } };
    const clips = [
      clip('adj', { effects: [fx], keys: { opacity: keys.opacity } }),
      clip('image', { kind: 'image', mediaId: 'img', keys }),
      clip('video', { kind: 'video', mediaId: 'vid', keys, effects: [fx] }),
      clip('overlay', { kind: 'overlay', overlay: { type: 'sticker' } as Clip['overlay'], keys }),
    ];
    const draws = await collect(project(clips.map((c) => [c])), 0.5);
    expect(draws.map((d) => d.clip.id)).toEqual(['adj', 'image', 'video', 'overlay']);
    for (const d of draws) {
      expect(d.clip.keys).toBeUndefined();
      expect(d.clip.transform.opacity).toBeCloseTo(0.5, 12);
      if (d.clip.id !== 'adj') expect(d.clip.transform.scale).toBeCloseTo(2, 12);
    }
    expect(isAdjustmentDraw(draws[0])).toBe(true);
    expect(draws[0].clip.effects[0].params.amount).toBeCloseTo(0.5, 12);
    expect(draws[0].clip.effects[0].keys).toBeUndefined();
    expect(draws[2].clip.effects[0].params.amount).toBeCloseTo(0.5, 12);
    expect(calls).toEqual(['adj', 'image', 'video', 'overlay']);
  });

  it('a static clip reaches its draw as the SAME object (zero-allocation fast path)', async () => {
    const clips = [clip('adj'), clip('image', { kind: 'image', mediaId: 'img' }), clip('video', { kind: 'video', mediaId: 'vid' })];
    const draws = await collect(project(clips.map((c) => [c])), 0.5);
    draws.forEach((d, i) => expect(d.clip).toBe(clips[i]));
  });

  it('a hidden track with keys is never resolved (counter), nor a clip outside its range', async () => {
    const keys = { opacity: [k(0, 0), k(1, 1)] };
    const p = project([
      [clip('shown', { keys })],
      [clip('hidden', { keys }), clip('hidden-2', { kind: 'image', mediaId: 'img', start: 2, keys })],
      [clip('later', { start: 1, keys })],
    ], [1]);
    await collect(p, 0.5);
    expect(calls).toEqual(['shown']);
    await collect(p, 2.5);
    expect(calls).toEqual(['shown', 'later']);
  });

  it('overlay textures are sized from the maximum scale over the keys, not the scale at t', async () => {
    const overlay = { type: 'sticker' } as Clip['overlay'];
    const animated = clip('ov', { kind: 'overlay', overlay, keys: { scale: [k(0, 1), k(1, 3), k(2, 0.5)] } });
    const still = clip('still', { kind: 'overlay', overlay, transform: { x: 0, y: 0, scale: 0.7, rotation: 0, opacity: 1 } });
    const got: unknown[][] = [];
    for (const t of [0, 0.5, 1.5]) await collect(project([[animated], [still]]), t, got);
    // get(clip, format, t, fps, pixelScale, textureScale)
    expect(got.filter((a) => (a[0] as Clip).id === 'ov').map((a) => a[5])).toEqual([3, 3, 3]);
    expect(got.filter((a) => (a[0] as Clip).id === 'ov').map((a) => (a[0] as Clip).transform.scale)).toEqual([1, 2, 1.75]);
    expect(got.filter((a) => (a[0] as Clip).id === 'still').map((a) => a[5])).toEqual([0.7, 0.7, 0.7]);
  });
});

describe('Plan 5B Task 6: presets, loops and the lower-third built-in slide in collectDraws', () => {
  const overlay = { type: 'sticker' } as Clip['overlay'];
  const lowerThird = { type: 'lowerThird' } as Clip['overlay'];
  const slot = (preset: 'pop' | 'fade') => ({ preset, duration: 0.5, delay: 0, ease: lin, params: (preset === 'pop' ? { intensity: 0.2 } : {}) as Record<string, number> });

  it('overlay textures are sized by maxDrawnScale (keys × offset loop × presets) of the RAW clip', async () => {
    const pop = clip('pop', { kind: 'overlay', overlay, keys: { scale: [k(0, 1), k(1, 2)] }, motion: { in: slot('pop') } });
    const climbing = clip('loop', { kind: 'overlay', overlay, keys: { scale: [k(0, 1), k(0.5, 1.5)], loops: { scale: { mode: 'offset', count: 2 } } } });
    const got: unknown[][] = [];
    for (const t of [0, 0.2, 1.5]) await collect(project([[pop], [climbing]]), t, got);
    expect(got.filter((a) => (a[0] as Clip).id === 'pop').map((a) => a[5])).toEqual([2.4, 2.4, 2.4]);
    expect(got.filter((a) => (a[0] as Clip).id === 'loop').map((a) => a[5])).toEqual([2.5, 2.5, 2.5]);
    // The drawn clip carries the preset (scale 0 at the Pop's first frame) and no motion.
    const first = got[0][0] as Clip;
    expect(first.transform.scale).toBe(0);
    expect(first.motion).toBeUndefined();
  });

  it('the built-in slide flags follow the RAW clip: off at an edge with an in/out preset, on otherwise', async () => {
    const plain = clip('plain', { kind: 'overlay', overlay: lowerThird });
    const withIn = clip('in', { kind: 'overlay', overlay: lowerThird, motion: { in: slot('fade') } });
    const both = clip('both', { kind: 'overlay', overlay: lowerThird, motion: { in: slot('fade'), out: slot('fade') } });
    const got: unknown[][] = [];
    await collect(project([[plain], [withIn], [both]]), 0.1, got);
    expect(got.map((a) => a[6])).toEqual([{ in: true, out: true }, { in: false, out: true }, { in: false, out: false }]);
  });

  it('a hidden track with motion is never resolved (counter); a visible static clip with an empty stack is the SAME object', async () => {
    const motion = { in: slot('fade') };
    const empty = clip('empty', { kind: 'image', mediaId: 'img', motion: {} });
    const p = project([[clip('shown', { motion })], [clip('hidden', { motion }), clip('hidden-img', { kind: 'image', mediaId: 'img', motion })], [empty]], [1]);
    const draws = await collect(p, 0.1);
    expect(calls).toEqual(['shown', 'empty']);
    expect(draws.find((d) => d.clip.id === 'empty')!.clip).toBe(empty);
    expect(draws.find((d) => d.clip.id === 'shown')!.clip.transform.opacity).toBeCloseTo(0.2, 12);
  });
});

describe('scale 0 (Ruling P5-3, Task 4 note M2): an invisible picture, never a NaN', () => {
  it('clipMatrix and the overlay texture size stay finite at scale 0', async () => {
    const { clipMatrix } = await import('../src/render/geometry');
    const { overlayTextureSize } = await import('../src/render/overlays/textures');
    const m = clipMatrix({ width: 40, height: 20 }, { x: 10, y: -5, scale: 0, rotation: 33, opacity: 1 }, { width: 320, height: 180 });
    expect(m.every(Number.isFinite)).toBe(true);
    expect([m[0], m[1], m[3], m[4]].map(Math.abs)).toEqual([0, 0, 0, 0]); // a zero-area quad: nothing is rasterised
    expect(overlayTextureSize({ width: 54, height: 54 }, 0, 1, 2048)).toEqual({ width: 54, height: 54 });
  });

  it('a clip whose keys evaluate to scale 0 reaches its draw with scale 0 (not NaN)', async () => {
    const c = clip('image', { kind: 'image', mediaId: 'img', keys: { scale: [k(0, 1), k(1, 0)] } });
    const [d] = await collect(project([[c]]), 1.5);
    expect(d.clip.transform.scale).toBe(0);
  });
});
