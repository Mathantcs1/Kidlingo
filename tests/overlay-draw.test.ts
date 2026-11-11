// drawOverlay on a recording fake 2D context (no canvas in Vitest): what each overlay type draws, and its animation.
import { describe, it, expect } from 'vitest';
import { STICKER_KINDS, overlayDefaults } from '../src/core/overlaySpec';
import type { OverlaySpec } from '../src/core/model';
import { SLIDE_SECONDS, drawOverlay, overlayAnimation } from '../src/render/overlays/draw';
import type { OverlayContext } from '../src/render/overlays/draw';

interface Call { name: string; args: unknown[]; fillStyle: unknown; strokeStyle: unknown; font: string; globalAlpha: number }

/** Records every method call with the style state at the time; measureText = 0.5 em per character. */
function fake(): { ctx: OverlayContext; calls: Call[] } {
  const calls: Call[] = [];
  const state = { fillStyle: '#000000' as unknown, strokeStyle: '#000000' as unknown, font: '10px sans-serif', globalAlpha: 1, lineWidth: 1, textAlign: 'start', textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt' };
  const stack: (typeof state)[] = [];
  const record = (name: string) => (...args: unknown[]) => {
    calls.push({ name, args, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, font: state.font, globalAlpha: state.globalAlpha });
  };
  const px = (): number => Number(/(\d+(?:\.\d+)?)px/.exec(state.font)?.[1] ?? 10);
  const methods = ['clearRect', 'fillRect', 'beginPath', 'closePath', 'moveTo', 'lineTo', 'arc', 'arcTo', 'quadraticCurveTo',
    'bezierCurveTo', 'rect', 'roundRect', 'fill', 'stroke', 'clip', 'translate', 'scale', 'rotate', 'fillText', 'ellipse'];
  const ctx = Object.fromEntries(methods.map((m) => [m, record(m)])) as Record<string, unknown>;
  ctx.save = () => stack.push({ ...state });
  ctx.restore = () => Object.assign(state, stack.pop());
  ctx.measureText = (s: string) => ({ width: Array.from(s).length * px() * 0.5 });
  for (const k of Object.keys(state)) {
    Object.defineProperty(ctx, k, { get: () => state[k as keyof typeof state], set: (v) => ((state as Record<string, unknown>)[k] = v) });
  }
  return { ctx: ctx as unknown as OverlayContext, calls };
}

const SIZE = { width: 400, height: 100 };
const texts = (calls: Call[]) => calls.filter((c) => c.name === 'fillText').map((c) => c.args[0]);

describe('overlayAnimation', () => {
  it('slides a lower third in over the first 0.4 s and out over the last 0.4 s (smoothstep)', () => {
    expect(SLIDE_SECONDS).toBe(0.4);
    const s = (t: number, d = 5) => overlayAnimation('lowerThird', t, d).slide;
    expect(s(0)).toBe(0);
    expect(s(0.2)).toBeCloseTo(0.5, 12);
    expect(s(0.1)).toBeCloseTo(0.15625, 12);
    expect(s(0.4)).toBe(1);
    expect(s(2.5)).toBe(1);
    expect(s(4.8)).toBeCloseTo(0.5, 12);
    expect(s(5)).toBe(0);
    expect(s(0.25, 0.5)).toBeCloseTo(s(0.25), 12);
    expect(s(-1)).toBe(0);
    expect(s(NaN)).toBe(0);
  });
  it('fills the progress bar with clip time / duration, clamped; other types are static', () => {
    expect(overlayAnimation('progressBar', 1, 4).fill).toBe(0.25);
    expect(overlayAnimation('progressBar', 9, 4).fill).toBe(1);
    expect(overlayAnimation('progressBar', -1, 4).fill).toBe(0);
    expect(overlayAnimation('progressBar', 1, 0).fill).toBe(1);
    for (const type of ['subscribe', 'sticker'] as const) expect(overlayAnimation(type, 0, 5)).toEqual({ slide: 1, fill: 1 });
    expect(overlayAnimation('progressBar', 0, 5).slide).toBe(1);
  });
});

describe('drawOverlay', () => {
  it('always clears the whole texture first', () => {
    for (const type of ['lowerThird', 'subscribe', 'progressBar', 'sticker'] as const) {
      const { ctx, calls } = fake();
      drawOverlay(ctx, overlayDefaults(type), SIZE, 0.5);
      expect(calls[0]).toMatchObject({ name: 'clearRect', args: [0, 0, 400, 100] });
    }
  });
  it('progress bar: the track in colour, then the fill in accent at progress × width', () => {
    const spec: OverlaySpec = { ...overlayDefaults('progressBar'), colour: '#111111', accent: '#ff0000' };
    for (const progress of [0, 0.5, 1]) {
      const { ctx, calls } = fake();
      drawOverlay(ctx, spec, SIZE, progress, 4);
      const rects = calls.filter((c) => c.name === 'fillRect');
      expect(rects[0]).toMatchObject({ args: [0, 0, 400, 100], fillStyle: '#111111' });
      if (progress === 0) expect(rects).toHaveLength(1);
      else expect(rects[1]).toMatchObject({ args: [0, 0, 400 * progress, 100], fillStyle: '#ff0000' });
    }
  });
  it('lower third: box in colour, accent bar, both lines of text, sliding in from the left', () => {
    const spec: OverlaySpec = { ...overlayDefaults('lowerThird'), text: 'Ada Lovelace', subtext: 'Mathematician', colour: '#202020', accent: '#ffcc00' };
    const at = (time: number) => {
      const { ctx, calls } = fake();
      drawOverlay(ctx, spec, SIZE, time / 5, 5);
      return calls;
    };
    const shown = at(2.5);
    expect(texts(shown)).toEqual(['Ada Lovelace', 'Mathematician']);
    expect(shown.some((c) => c.name === 'fill' && c.fillStyle === '#202020')).toBe(true);
    expect(shown.some((c) => c.name === 'fillRect' && c.fillStyle === '#ffcc00')).toBe(true);
    expect(shown.find((c) => c.name === 'translate')?.args).toEqual([0, 0]);
    // Not yet in: nothing but the clear; half way: shifted left by half its width and half transparent.
    expect(at(0).map((c) => c.name)).toEqual(['clearRect']);
    const half = at(0.2);
    expect(half.find((c) => c.name === 'translate')?.args).toEqual([-200, 0]);
    expect(half.find((c) => c.name === 'fillText')?.globalAlpha).toBeCloseTo(0.5, 12);
    expect(at(5).map((c) => c.name)).toEqual(['clearRect']);
  });
  it('lower third without subtext draws one line', () => {
    const { ctx, calls } = fake();
    drawOverlay(ctx, { ...overlayDefaults('lowerThird'), subtext: '' }, SIZE, 0.5);
    expect(texts(calls)).toEqual(['Your Name']);
  });
  it('shortens text that does not fit with an ellipsis, within the box', () => {
    const { ctx, calls } = fake();
    drawOverlay(ctx, { ...overlayDefaults('lowerThird'), text: 'W'.repeat(80) }, SIZE, 0.5);
    const t = calls.find((c) => c.name === 'fillText')!;
    expect(String(t.args[0]).endsWith('…')).toBe(true);
    const fontPx = Number(/(\d+(?:\.\d+)?)px/.exec(t.font)![1]);
    expect(Array.from(String(t.args[0])).length * fontPx * 0.5).toBeLessThanOrEqual(400);
    expect(t.font).toMatch(/system-ui/);
  });
  it('subscribe: a button in colour with its text in accent', () => {
    const { ctx, calls } = fake();
    drawOverlay(ctx, { ...overlayDefaults('subscribe'), colour: '#cc0000', accent: '#ffffff' }, SIZE, 0);
    expect(calls.some((c) => c.name === 'fill' && c.fillStyle === '#cc0000')).toBe(true);
    const t = calls.find((c) => c.name === 'fillText')!;
    expect(t).toMatchObject({ args: expect.arrayContaining(['SUBSCRIBE']), fillStyle: '#ffffff' });
  });
  it('stickers: every kind fills a shape in colour and outlines it in accent, each with its own path', () => {
    const paths = new Set<string>();
    for (const sticker of STICKER_KINDS) {
      const { ctx, calls } = fake();
      drawOverlay(ctx, { ...overlayDefaults('sticker'), sticker, colour: '#00ff00', accent: '#0000ff' }, { width: 100, height: 100 }, 0.5);
      expect(calls.some((c) => c.name === 'fill' && c.fillStyle === '#00ff00'), sticker).toBe(true);
      expect(calls.some((c) => c.name === 'stroke' && c.strokeStyle === '#0000ff'), sticker).toBe(true);
      const path = calls.filter((c) => !['clearRect', 'fill', 'stroke', 'beginPath', 'closePath'].includes(c.name));
      paths.add(JSON.stringify(path.map((c) => [c.name, c.args])));
      // Everything stays inside the 100 x 100 texture.
      for (const c of path) {
        if (!['moveTo', 'lineTo'].includes(c.name)) continue;
        const [x, y] = c.args as number[];
        expect(x, sticker).toBeGreaterThanOrEqual(0);
        expect(x, sticker).toBeLessThanOrEqual(100);
        expect(y, sticker).toBeGreaterThanOrEqual(0);
        expect(y, sticker).toBeLessThanOrEqual(100);
      }
    }
    expect(paths.size).toBe(STICKER_KINDS.length);
  });
  it('is deterministic: the same inputs give the same calls', () => {
    const a = fake();
    const b = fake();
    drawOverlay(a.ctx, overlayDefaults('lowerThird'), SIZE, 0.03, 5);
    drawOverlay(b.ctx, overlayDefaults('lowerThird'), SIZE, 0.03, 5);
    expect(JSON.stringify(a.calls)).toBe(JSON.stringify(b.calls));
  });
});
