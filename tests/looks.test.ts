import { describe, it, expect } from 'vitest';
import { LOOKS } from '../src/core/looks';
import type { LookKey } from '../src/core/looks';
import { AVAILABLE_VIDEO_EFFECTS, MAX_VIDEO_EFFECTS, VIDEO_EFFECTS, clampParams, defaultParams } from '../src/core/videoEffects';
import { applyLook } from '../src/core/videoEffectEdits';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project, VideoEffectType } from '../src/core/model';
import { useEditor } from '../src/state/store';
import { PASS_SHADERS } from '../src/render/effects/programs';
import {
  SEPIA_MATRIX, bwPixel, grainHash, grainPixel, hueToRgb, sepiaPixel, splitTonePixel, vignettePixel,
} from '../src/render/effects/looksMath';
import type { Rgb } from '../src/render/effects/looksMath';

const KEYS = ['bw', 'sepia', 'vintage', 'tealOrange', 'cinematic', 'moody', 'goldenHour', 'coolBlue', 'punchy'] as const;
const NEW: VideoEffectType[] = ['bw', 'sepia', 'splitTone', 'vignette', 'grain'];
const SAMPLES: Rgb[] = [[0, 0, 0], [1, 1, 1], [1, 0, 0], [0.5, 0.5, 0.5], [0.2, 0.6, 0.9], [0.03, 0.01, 0.7], [0.9, 0.8, 0.1]];
const at = (type: VideoEffectType, over: Record<string, number>): Record<string, number> => ({ ...defaultParams(type), ...over });

describe('the nine looks', () => {
  it('are exactly the nine keys, each 1-8 effects of available types with every param valid under clampParams', () => {
    expect(Object.keys(LOOKS).sort()).toEqual([...KEYS].sort());
    for (const key of KEYS) {
      const { label, effects } = LOOKS[key as LookKey];
      expect(label.length, key).toBeGreaterThan(0);
      expect(effects.length, key).toBeGreaterThanOrEqual(1);
      expect(effects.length, key).toBeLessThanOrEqual(MAX_VIDEO_EFFECTS);
      for (const e of effects) {
        expect(AVAILABLE_VIDEO_EFFECTS.has(e.type), `${key}: ${e.type} available`).toBe(true);
        expect(e.enabled).toBe(true);
        for (const k of Object.keys(e.params)) expect(VIDEO_EFFECTS[e.type].params.some((d) => d.key === k), `${key}.${e.type}.${k}`).toBe(true);
        // clampParams fills defaults and clamps: a valid look is unchanged by it (on top of the defaults).
        expect(clampParams(e.type, e.params), `${key}.${e.type}`).toEqual({ ...defaultParams(e.type), ...e.params });
      }
    }
  });
});

describe('look effects registration', () => {
  it('bw, sepia, splitTone, vignette and grain are available with a registered shader', () => {
    for (const t of NEW) {
      expect(VIDEO_EFFECTS[t].available, t).toBe(true);
      expect(PASS_SHADERS[t], t).toBeDefined();
    }
  });
});

describe('bw', () => {
  it('amount 1 gives the Rec.709 luma on every channel', () => {
    for (const c of SAMPLES) {
      const [r, g, b] = bwPixel(c, 1);
      const y = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
      expect(r).toBeCloseTo(y, 12);
      expect(g).toBeCloseTo(y, 12);
      expect(b).toBeCloseTo(y, 12);
    }
  });
  it('amount 0 is the exact identity and 0.5 is halfway', () => {
    for (const c of SAMPLES) expect(bwPixel(c, 0)).toEqual(c);
    const [r] = bwPixel([1, 0, 0], 0.5);
    expect(r).toBeCloseTo(0.5 * 1 + 0.5 * 0.2126, 12);
  });
});

describe('sepia', () => {
  it('uses the classic sepia matrix at amount 1 (clamped)', () => {
    expect(SEPIA_MATRIX).toEqual([[0.393, 0.769, 0.189], [0.349, 0.686, 0.168], [0.272, 0.534, 0.131]]);
    const [r, g, b] = sepiaPixel([0.5, 0.4, 0.2], 1);
    expect(r).toBeCloseTo(0.393 * 0.5 + 0.769 * 0.4 + 0.189 * 0.2, 12);
    expect(g).toBeCloseTo(0.349 * 0.5 + 0.686 * 0.4 + 0.168 * 0.2, 12);
    expect(b).toBeCloseTo(0.272 * 0.5 + 0.534 * 0.4 + 0.131 * 0.2, 12);
    expect(sepiaPixel([1, 1, 1], 1)[0]).toBe(1);
  });
  it('amount 0 is the exact identity', () => {
    for (const c of SAMPLES) expect(sepiaPixel(c, 0)).toEqual(c);
  });
});

describe('hueToRgb (HSV, saturation 1, value 1)', () => {
  it('maps the primaries and secondaries', () => {
    const near = (a: Rgb, b: Rgb) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 12));
    near(hueToRgb(0), [1, 0, 0]);
    near(hueToRgb(60), [1, 1, 0]);
    near(hueToRgb(120), [0, 1, 0]);
    near(hueToRgb(180), [0, 1, 1]);
    near(hueToRgb(240), [0, 0, 1]);
    near(hueToRgb(300), [1, 0, 1]);
    near(hueToRgb(360), [1, 0, 0]);
    near(hueToRgb(30), [1, 0.5, 0]);
  });
});

describe('splitTone', () => {
  it('both amounts 0 is the exact identity, whatever the hues and balance', () => {
    const p = at('splitTone', { shadowAmount: 0, highlightAmount: 0, shadowHue: 120, highlightHue: 300, balance: 0.7 });
    for (const c of SAMPLES) expect(splitTonePixel(c, p)).toEqual(c);
  });
  it('tints shadows towards the shadow hue and highlights towards the highlight hue', () => {
    const p = at('splitTone', { shadowHue: 240, shadowAmount: 1, highlightHue: 0, highlightAmount: 0 });
    const dark = splitTonePixel([0.1, 0.1, 0.1], p);
    expect(dark[2]).toBeGreaterThan(dark[0]);
    const q = at('splitTone', { shadowAmount: 0, highlightHue: 0, highlightAmount: 1 });
    const bright = splitTonePixel([0.9, 0.9, 0.9], q);
    expect(bright[0]).toBeGreaterThan(bright[2]);
  });
  it('balance + moves the pivot so more of the picture is treated as highlights', () => {
    const base = { shadowHue: 240, shadowAmount: 1, highlightAmount: 0 };
    const dark = (balance: number) => splitTonePixel([0.5, 0.5, 0.5], at('splitTone', { ...base, balance }));
    expect(dark(1)[2] - dark(1)[0]).toBeLessThan(dark(-1)[2] - dark(-1)[0]);
  });
});

describe('vignette', () => {
  const P = (over: Record<string, number> = {}) => at('vignette', over);
  const box = { width: 100, height: 100 };
  it('amount 0 is the exact identity', () => {
    for (const c of SAMPLES) expect(vignettePixel(c, 3.5, 9.5, box, P({ amount: 0 }))).toEqual(c);
  });
  it('leaves the centre, darkens the corners to (1 − amount), alpha-free', () => {
    const c: Rgb = [0.8, 0.6, 0.4];
    expect(vignettePixel(c, 50, 50, box, P())).toEqual(c);
    const corner = vignettePixel(c, 0, 0, box, P({ amount: 0.5, size: 0.5, softness: 0.5 }));
    expect(corner[0]).toBeCloseTo(0.8 * 0.5, 2);
  });
  it('is aspect-correct: the same pixel distance from the centre darkens equally on a wide image', () => {
    const wide = { width: 400, height: 100 };
    const p = P({ amount: 0.8, size: 0.2, softness: 0.4 });
    const a = vignettePixel([1, 1, 1], 200 + 60, 50, wide, p);
    const b = vignettePixel([1, 1, 1], 200, 50 + 40, wide, p);
    const c = vignettePixel([1, 1, 1], 200 + 40, 50, wide, p);
    expect(b[0]).toBeCloseTo(c[0], 12);
    expect(a[0]).toBeLessThan(c[0]);
  });
});

describe('grain', () => {
  it('hash is deterministic and in [0, 1)', () => {
    expect(grainHash(3, 10, 20)).toBe(grainHash(3, 10, 20));
    expect(grainHash(3, 10, 20)).not.toBe(grainHash(4, 10, 20));
    expect(grainHash(3, 10, 20)).not.toBe(grainHash(3, 11, 20));
    expect(grainHash(3, 10, 20)).not.toBe(grainHash(3, 10, 21));
    for (let i = 0; i < 1000; i++) {
      const h = grainHash(i, i * 7, i * 13);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });
  it('is uniform: mean ≈ 0.5 and every decile populated over 10 000 samples', () => {
    let sum = 0;
    const bins = new Array<number>(10).fill(0);
    for (let i = 0; i < 10000; i++) {
      const h = grainHash(i % 5, i % 100, Math.floor(i / 100));
      sum += h;
      bins[Math.floor(h * 10)]++;
    }
    expect(Math.abs(sum / 10000 - 0.5)).toBeLessThan(0.02);
    for (const n of bins) expect(Math.abs(n - 1000)).toBeLessThan(150);
  });
  it('amount 0 is the exact identity; the noise is zero-mean luminance noise (equal on all channels)', () => {
    for (const c of SAMPLES) expect(grainPixel(c, 5, 7, 2, at('grain', { amount: 0 }))).toEqual(c);
    const p = at('grain', { amount: 0.2, size: 1 });
    let sum = 0;
    for (let i = 0; i < 4000; i++) {
      const [r, g, b] = grainPixel([0.5, 0.5, 0.5], i % 64, Math.floor(i / 64), 1, p);
      expect(r).toBe(g);
      expect(g).toBe(b);
      sum += r - 0.5;
    }
    expect(Math.abs(sum / 4000)).toBeLessThan(0.005);
  });
  it('size groups pixels into cells: neighbours inside one cell share their noise', () => {
    const p = at('grain', { amount: 0.5, size: 4 });
    expect(grainPixel([0.5, 0.5, 0.5], 4, 8, 0, p)).toEqual(grainPixel([0.5, 0.5, 0.5], 7, 11, 0, p));
    expect(grainPixel([0.5, 0.5, 0.5], 4, 8, 0, p)).not.toEqual(grainPixel([0.5, 0.5, 0.5], 8, 8, 0, p));
  });
});

describe('applyLook as one undo step through the store', () => {
  const clip = (): Clip => ({
    id: 'v1', mediaId: 'm1', kind: 'video', start: 0, in: 0, out: 4, transform: defaultTransform(), volume: 1,
    audio: defaultClipAudio(), effects: [], blend: 'normal', fit: 'fit',
  });
  const project = (): Project => {
    const p = emptyProject();
    return {
      ...p,
      media: { m1: { id: 'm1', name: 'a.mp4', kind: 'video', duration: 10, width: 64, height: 64, fps: 30, hasAudio: false } },
      tracks: p.tracks.map((t) => (t.kind === 'video' ? { ...t, clips: [clip()] } : t)),
    };
  };
  const stack = (): { type: string }[] => useEditor.getState().history.present.tracks.flatMap((t) => t.clips)[0].effects;

  it('applies the whole stack in one apply and one undo restores the previous stack exactly', () => {
    useEditor.getState().loadProject(project());
    useEditor.getState().apply((p) => applyLook(p, 'v1', 'bw'));
    const before = useEditor.getState().history.present;
    const pastBefore = useEditor.getState().history.past.length;
    useEditor.getState().apply((p) => applyLook(p, 'v1', 'vintage'));
    expect(useEditor.getState().history.past.length).toBe(pastBefore + 1);
    expect(stack().map((e) => e.type)).toEqual(LOOKS.vintage.effects.map((e) => e.type));
    useEditor.getState().undo();
    expect(useEditor.getState().history.present).toBe(before);
    expect(stack().map((e) => e.type)).toEqual(['bw']);
    useEditor.getState().redo();
    expect(stack().length).toBe(LOOKS.vintage.effects.length);
  });
});
