// Plan 5B Task 8: the DOM-free maths of on-canvas motion path editing - drag threshold, key dot drags, tangent handle
// drags (smooth keys mirror the other handle's DIRECTION keeping its length; Alt breaks), double-click corner toggle.
import { describe, expect, it } from 'vitest';
import type { PositionKeyframe, Vec } from '../src/core/model';
import { withTangentPatch } from '../src/core/pathEdits';
import {
  cornerTogglePatch, draggedKeyXY, draggedTangent, isCorner, pathDragStarted, shownTangents, tangentDragPatch,
} from '../src/ui/pathDragMath';
import { pk } from './keyframe-fixtures';

const len = (v: Vec) => Math.hypot(v.x, v.y);
const three = (mid: Partial<PositionKeyframe> = {}): PositionKeyframe[] => [pk(0, 0, 0), { ...pk(1, 300, 0), ...mid }, pk(2, 300, 300)];

describe('drag threshold and key dot drags', () => {
  it('a press stays a click until the pointer travelled 4 CSS px', () => {
    expect(pathDragStarted({ x: 10, y: 10 }, { x: 13, y: 10 })).toBe(false);
    expect(pathDragStarted({ x: 10, y: 10 }, { x: 12, y: 12 })).toBe(false); // 2.83 px
    expect(pathDragStarted({ x: 10, y: 10 }, { x: 14, y: 10 })).toBe(true);
    expect(pathDragStarted({ x: 10, y: 10 }, { x: 10, y: 6 })).toBe(true);
  });
  it('a dragged key moves by the pointer delta in format px (no jump to the pointer)', () => {
    expect(draggedKeyXY({ x: -400, y: -200 }, { x: 500, y: 300 }, { x: 560, y: 260 })).toEqual({ x: -340, y: -240 });
    expect(draggedKeyXY({ x: 1, y: 2 }, { x: 5, y: 5 }, { x: 5, y: 5 })).toEqual({ x: 1, y: 2 });
  });
  it('a dragged tangent handle moves by the pointer delta from where it was grabbed', () => {
    expect(draggedTangent({ x: 100, y: 0 }, { x: 0, y: 0 }, { x: 10, y: -50 })).toEqual({ x: 110, y: -50 });
  });
});

describe('shown tangents', () => {
  it('ends show only the side that has a neighbour; stored tangents are shown as they are', () => {
    const list = [{ ...pk(0, 0, 0), out: { x: 50, y: 10 } }, pk(1, 300, 0)];
    const first = shownTangents(list, 0);
    expect(first.in).toBeUndefined();
    expect(first.out).toEqual({ v: { x: 50, y: 10 }, empty: false });
    const last = shownTangents(list, 1);
    expect(last.out).toBeUndefined();
    expect(last.in!.empty).toBe(true);
    expect(last.in!.v).toEqual({ x: -100, y: 0 }); // one third of the chord to its neighbour (Smooth path's default)
  });
  it('an interior key without tangents shows the Catmull-Rom defaults (prev to next direction, own-chord thirds)', () => {
    const s = shownTangents(three(), 1);
    expect(s.in!.empty).toBe(true);
    expect(s.out!.empty).toBe(true);
    const d = Math.SQRT1_2;
    expect(s.out!.v.x).toBeCloseTo(100 * d, 9);
    expect(s.out!.v.y).toBeCloseTo(100 * d, 9);
    expect(s.in!.v.x).toBeCloseTo(-100 * d, 9);
    expect(s.in!.v.y).toBeCloseTo(-100 * d, 9);
  });
  it('a single key shows no handles', () => {
    expect(shownTangents([pk(0, 0, 0)], 0)).toEqual({});
  });
});

describe('tangent drags', () => {
  it('smooth key: the other handle turns to the opposite direction and KEEPS ITS LENGTH; both are passed', () => {
    const list = three({ in: { x: -30, y: -40 }, out: { x: 10, y: 0 } });
    const patch = tangentDragPatch(list, 1, 'out', { x: 0, y: 100 }, false);
    expect(patch.out).toEqual({ x: 0, y: 100 });
    expect(patch.in!.x).toBeCloseTo(0, 12);
    expect(patch.in!.y).toBeCloseTo(-50, 12); // |in| was 50
    expect(patch.broken).toBeUndefined();
    const k = withTangentPatch(list[1], patch);
    expect(len(k.in!)).toBeCloseTo(50, 12);
    expect(k.broken).toBeUndefined();
  });
  it('smooth key without the other tangent: both are set (the other at its default length), so it is no visual corner', () => {
    const list = three();
    const patch = tangentDragPatch(list, 1, 'in', { x: -200, y: 0 }, false);
    expect(patch.in).toEqual({ x: -200, y: 0 });
    expect(patch.out!.x).toBeCloseTo(100, 9); // default out length = |(0,300)|/3 = 100, direction opposite in
    expect(patch.out!.y).toBeCloseTo(0, 9);
  });
  it('an end key drags its one handle alone', () => {
    const patch = tangentDragPatch([pk(0, 0, 0), pk(1, 300, 0)], 0, 'out', { x: 90, y: -90 }, false);
    expect(patch).toEqual({ out: { x: 90, y: -90 } });
  });
  it('Alt breaks the key: only the dragged handle changes and the key becomes broken', () => {
    const list = three({ in: { x: -30, y: -40 }, out: { x: 10, y: 0 } });
    const patch = tangentDragPatch(list, 1, 'out', { x: 0, y: 100 }, true);
    expect(patch).toEqual({ out: { x: 0, y: 100 }, broken: true });
    const k = withTangentPatch(list[1], patch);
    expect(k.in).toEqual({ x: -30, y: -40 });
    expect(k.broken).toBe(true);
  });
  it('a broken key moves its handles independently without Alt', () => {
    const list = three({ in: { x: -30, y: -40 }, out: { x: 10, y: 0 }, broken: true });
    expect(tangentDragPatch(list, 1, 'in', { x: 5, y: 5 }, false)).toEqual({ in: { x: 5, y: 5 } });
  });
  it('dragging a handle back onto its key removes that tangent', () => {
    expect(tangentDragPatch(three(), 1, 'out', { x: 0, y: 0 }, false)).toEqual({ out: null });
  });
});

describe('corner / smooth toggle (double-click)', () => {
  it('a key without tangents is a corner; double-click smooths it; again makes it a corner', () => {
    const list = three();
    expect(isCorner(list, 1)).toBe(true);
    const smooth = withTangentPatch(list[1], cornerTogglePatch(list, 1));
    const next = [list[0], smooth, list[2]];
    expect(isCorner(next, 1)).toBe(false);
    expect(smooth.in).toBeDefined();
    expect(smooth.out).toBeDefined();
    expect(smooth.in!.x * smooth.out!.y - smooth.in!.y * smooth.out!.x).toBeCloseTo(0, 9); // collinear
    const corner = withTangentPatch(smooth, cornerTogglePatch(next, 1));
    expect(corner.in).toBeUndefined();
    expect(corner.out).toBeUndefined();
    expect(isCorner([list[0], corner, list[2]], 1)).toBe(true);
  });
  it('a broken key is a corner; double-click re-aligns it (keeps its tangents, clears broken)', () => {
    const list = three({ in: { x: -30, y: -40 }, out: { x: 10, y: 0 }, broken: true });
    expect(isCorner(list, 1)).toBe(true);
    expect(cornerTogglePatch(list, 1)).toEqual({ broken: false });
    const k = withTangentPatch(list[1], { broken: false });
    expect(len(k.in!)).toBeCloseTo(50, 12);
    expect(k.in!.x).toBeLessThan(0);
  });
  it('a smooth key with one tangent on an interior key is a corner (it draws one)', () => {
    expect(isCorner(three({ out: { x: 10, y: 0 } }), 1)).toBe(true);
    expect(isCorner([pk(0, 0, 0), pk(1, 1, 1)], 0)).toBe(true);
    expect(isCorner([{ ...pk(0, 0, 0), out: { x: 1, y: 0 } }, pk(1, 1, 1)], 0)).toBe(false);
  });
});
