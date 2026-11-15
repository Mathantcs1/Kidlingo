import { describe, it, expect } from 'vitest';
import { cornerRadius, fitText, lowerThirdLayout, progressRect } from '../src/overlays/layout';
import { OVERLAY_DEFAULTS } from '../src/overlays/spec';

/** A fake monospace font: every character is 0.6 x the font size wide. */
const measure = (t: string, size: number): number => t.length * size * 0.6;

describe('fitText', () => {
  it('keeps the full size when the text fits', () => {
    expect(fitText('Hello', 300, 40, 20, measure)).toEqual({ lines: ['Hello'], size: 40 });
  });

  it('shrinks toward the minimum size before cutting anything', () => {
    const r = fitText('ABCDEFGHIJKLMNO', 300, 40, 20, measure);
    expect(r.lines).toEqual(['ABCDEFGHIJKLMNO']);
    expect(r.size).toBeLessThan(40);
    expect(r.size).toBeGreaterThanOrEqual(20);
    expect(measure(r.lines[0], r.size)).toBeLessThanOrEqual(300);
  });

  it('at the minimum size ends with an ellipsis and fits', () => {
    const r = fitText('x'.repeat(60), 300, 40, 20, measure);
    expect(r.size).toBe(20);
    expect(r.lines).toHaveLength(1);
    expect(r.lines[0].endsWith('…')).toBe(true);
    expect(measure(r.lines[0], 20)).toBeLessThanOrEqual(300);
    expect(r.lines[0].length).toBeGreaterThan(1);
  });

  it('draws nothing for empty or blank text, and survives a zero-width box', () => {
    expect(fitText('', 300, 40, 20, measure).lines).toEqual([]);
    expect(fitText('   ', 300, 40, 20, measure).lines).toEqual([]);
    expect(fitText('abc', 0, 40, 20, measure).lines.join('').length).toBeLessThanOrEqual(1);
  });

  it('never cuts a code point in half', () => {
    const r = fitText('😀'.repeat(50), 120, 40, 20, (t, s) => Array.from(t).length * s);
    expect(r.lines[0]).toBe(Array.from(r.lines[0]).join(''));
  });
});

describe('progressRect', () => {
  it('fills the given fraction of the width and clamps bad values', () => {
    expect(progressRect(0, 1920, 16)).toEqual({ x: 0, y: 0, width: 0, height: 16 });
    expect(progressRect(0.5, 1920, 16).width).toBe(960);
    expect(progressRect(1, 1920, 16).width).toBe(1920);
    expect(progressRect(1.3, 1920, 16).width).toBe(1920);
    expect(progressRect(-0.2, 1920, 16).width).toBe(0);
    expect(progressRect(NaN, 1920, 16).width).toBe(0);
  });
});

describe('cornerRadius', () => {
  it('scales with the corner setting and never exceeds half the short side', () => {
    expect(cornerRadius(0, 100, 40)).toBe(0);
    expect(cornerRadius(0.5, 100, 40)).toBe(10);
    expect(cornerRadius(1, 100, 40)).toBe(20);
    expect(cornerRadius(9, 100, 40)).toBe(20);
    expect(cornerRadius(NaN, 100, 40)).toBe(0);
  });
});

describe('lowerThirdLayout', () => {
  const spec = (text: string, subtext: string) => ({ ...OVERLAY_DEFAULTS.lowerThird, text, subtext });

  it('places the title and subtitle inside the panel, leaves out empty lines, and draws only shapes when both are empty', () => {
    const both = lowerThirdLayout(spec('Mathan', 'Creator'), measure);
    expect(both.title && both.subtitle).toBeTruthy();
    for (const t of [both.title!, both.subtitle!]) {
      expect(t.x).toBeGreaterThanOrEqual(both.panel.x);
      expect(t.y).toBeLessThanOrEqual(both.panel.height);
    }
    expect(both.title!.y).toBeLessThan(both.subtitle!.y);
    const onlyTitle = lowerThirdLayout(spec('Mathan', ''), measure);
    expect(onlyTitle.title).not.toBeNull();
    expect(onlyTitle.subtitle).toBeNull();
    const none = lowerThirdLayout(spec('', ''), measure);
    expect(none.title).toBeNull();
    expect(none.subtitle).toBeNull();
    expect(none.panel.width).toBeGreaterThan(0);
  });
});

describe('overlayProgress', () => {
  it('is 0 on the first frame and 1 on the last frame of the clip, whatever the playhead does between frames', async () => {
    const { overlayProgress } = await import('../src/overlays/progress');
    const { emptyProject } = await import('../src/core/model');
    const { addOverlay } = await import('../src/core/overlayEdits');
    let p = { ...emptyProject(), format: { width: 640, height: 360, fps: 10 } };
    p = addOverlay(p, 'progress', { start: 1 });
    const clip = p.tracks.flatMap((t) => t.clips)[0];
    expect(clip.out).toBe(3);
    expect(overlayProgress(clip, p, 1, 0)).toBe(0);
    expect(overlayProgress(clip, p, 1.04, 0)).toBe(0);
    expect(overlayProgress(clip, p, 2.5, 0)).toBeCloseTo(15 / 29, 9);
    expect(overlayProgress(clip, p, 3.9, 0)).toBe(1);
    expect(overlayProgress(clip, p, 0.2, 0)).toBe(0);
    expect(overlayProgress(clip, p, 9, 0)).toBe(1);
    expect(overlayProgress(clip, p, 2, 1)).toBeCloseTo(20 / 39, 9);
  });
});
