// Plan 5B Task 7: preset browser tiles are drawn by the SAME resolver as the clip (D10, Q12): a synthetic card clip with
// the preset in its slot, resolveClip'ed at the tile time, its corners from clipCorners (the handles' geometry). Also the
// still frame each unhovered tile shows, and the looping tile clock.
import { describe, expect, it } from 'vitest';
import { resolveClip } from '../src/core/animate';
import type { MotionSlot, PresetKey } from '../src/core/motionTypes';
import { MOTION_SLOTS } from '../src/core/motionTypes';
import { PRESETS, presetsForSlot } from '../src/core/presets';
import { clipCorners } from '../src/render/overlayGeometry';
import { CARD, TILE, cardClip, previewCorners, previewFrame, previewLength, stillTime, tileTime } from '../src/ui/presetPreview';

const ALL: [PresetKey, MotionSlot][] = MOTION_SLOTS.flatMap((slot) => presetsForSlot(slot).map((k): [PresetKey, MotionSlot] => [k, slot]));

describe('presetPreview', () => {
  it('covers the 28 entries of the library', () => {
    expect(ALL).toHaveLength(28);
  });

  it('corners equal clipCorners(resolveClip(card, t)) for every preset and slot at many times (the one resolver)', () => {
    for (const [key, slot] of ALL) {
      const card = cardClip(key, slot);
      expect(card.motion?.[slot]?.preset).toBe(key);
      const len = previewLength(key, slot);
      for (let i = 0; i <= 24; i++) {
        const t = (len * i) / 24;
        const drawn = resolveClip(card, t, TILE);
        expect(previewCorners(key, slot, t)).toEqual(clipCorners(CARD, drawn.transform, TILE));
        expect(previewFrame(key, slot, t).opacity).toBe(drawn.transform.opacity);
      }
    }
  });

  it('the card is 60 % of the tile, 16:9, centred at rest', () => {
    expect(CARD.width).toBeCloseTo(0.6 * TILE.width, 12);
    expect(CARD.height).toBeCloseTo((CARD.width * 9) / 16, 12);
    const rest = previewFrame('fade', 'in', previewLength('fade', 'in') - 0.01);
    expect(rest.opacity).toBe(1);
    expect(rest.corners[0]).toEqual({ x: (TILE.width - CARD.width) / 2, y: (TILE.height - CARD.height) / 2 });
  });

  it('shows the real start states: Slide In from the left starts one tile width to the left, Fade In invisible', () => {
    const rest = previewCorners('slide', 'in', previewLength('slide', 'in') - 0.01);
    const start = previewCorners('slide', 'in', 0);
    expect(start[0].x).toBeCloseTo(rest[0].x - TILE.width * PRESETS.slide.params[1].def, 9);
    expect(previewFrame('fade', 'in', 0).opacity).toBe(0);
    // An exit ends gone (Fade Out at the clip end).
    expect(previewFrame('fade', 'out', previewLength('fade', 'out')).opacity).toBe(0);
  });

  it('the still frame lies inside the loop and differs from the rest frame (corners or opacity) for every entry', () => {
    for (const [key, slot] of ALL) {
      const len = previewLength(key, slot);
      const s = stillTime(key, slot);
      expect(s, `${slot} ${key}`).toBeGreaterThanOrEqual(0);
      expect(s, `${slot} ${key}`).toBeLessThan(len);
      const still = previewFrame(key, slot, s);
      const rest = { corners: clipCorners(CARD, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, TILE), opacity: 1 };
      const moved = still.opacity !== rest.opacity || still.corners.some((c, i) => Math.hypot(c.x - rest.corners[i].x, c.y - rest.corners[i].y) > 0.25);
      expect(moved, `${slot} ${key} still is telling`).toBe(true);
    }
  });

  it('the tile clock loops over the preview length and snaps to the 30 fps tile grid', () => {
    const len = previewLength('fade', 'in');
    expect(len).toBeCloseTo(PRESETS.fade.defaultDuration + 0.4, 12);
    expect(tileTime('fade', 'in', 0)).toBe(0);
    const t = tileTime('fade', 'in', 123);
    expect(Math.abs(t * TILE.fps - Math.round(t * TILE.fps))).toBeLessThan(1e-9);
    expect(t).toBeLessThanOrEqual(0.123);
    expect(t).toBeGreaterThan(0.123 - 1 / TILE.fps);
    const wrapped = tileTime('fade', 'in', (len + 0.2) * 1000);
    expect(wrapped).toBeGreaterThanOrEqual(0);
    expect(wrapped).toBeLessThan(len);
    expect(wrapped).toBeCloseTo(Math.floor(0.2 * TILE.fps + 1e-9) / TILE.fps, 9);
    for (const [key, slot] of ALL) expect(tileTime(key, slot, 1e9)).toBeLessThan(previewLength(key, slot));
  });
});
