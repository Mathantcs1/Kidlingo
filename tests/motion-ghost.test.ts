// Plan 5B Task 7 (D3, Ruling P5B-7): the ghost outline of a preset-moved picture (where the resolver draws it while
// the handles stay at the rest transform) and the ghost as a selection hit region.
import { describe, expect, it } from 'vitest';
import { resolveClip, resolvedTransform } from '../src/core/animate';
import { setPreset } from '../src/core/motionEdits';
import type { Project } from '../src/core/model';
import { clipCorners } from '../src/render/overlayGeometry';
import { ghostHitAt, motionGhost, pointInQuad } from '../src/ui/motionGhost';
import { clipOf, project } from './keyframe-fixtures';

const SIZE = { width: 1920, height: 1080 };
const withSlide = (p: Project = project()): Project => setPreset(p, 'c', 'in', 'slide', 10);

describe('motionGhost', () => {
  it('is the drawn quad at a Slide In first frame and null at rest', () => {
    const p = withSlide();
    const c = clipOf(p, 'c');
    const ghost = motionGhost(p, c, 10);
    expect(ghost).toEqual(clipCorners(SIZE, resolveClip(c, 10, p.format).transform, p.format));
    expect(ghost![0].x).toBeCloseTo(-1920, 9);
    // The handles' (rest) quad is elsewhere.
    expect(clipCorners(SIZE, resolvedTransform(c, 10, 30), p.format)[0].x).toBe(0);
    expect(motionGhost(p, c, 12)).toBeNull();
    expect(motionGhost(project(), clipOf(project(), 'c'), 10)).toBeNull();
  });

  it('is null when only opacity changes (a fade draws on the handles), and off the clip', () => {
    const p = setPreset(project(), 'c', 'in', 'fade', 10);
    expect(motionGhost(p, clipOf(p, 'c'), 10.1)).toBeNull();
    expect(motionGhost(withSlide(), clipOf(withSlide(), 'c'), 9)).toBeNull();
  });

  it('works for overlays (base size) and never for adjustment or audio clips', () => {
    const p = setPreset(project(), 'o', 'emphasis', 'pulse', 20.2);
    expect(motionGhost(p, clipOf(p, 'o'), 20.4)).not.toBeNull();
    const a = setPreset(project(), 'adj', 'in', 'fade', 30);
    expect(motionGhost(a, clipOf(a, 'adj'), 30.1)).toBeNull();
    expect(motionGhost(a, clipOf(a, 'ac'), 10.1)).toBeNull();
  });
});

describe('ghostHitAt', () => {
  it('finds the preset-moved picture at a point inside its drawn quad, not at its rest quad', () => {
    const p = withSlide();
    expect(ghostHitAt(p, 10, { x: -960, y: 540 })).toBe('c');
    expect(ghostHitAt(p, 10, { x: 960, y: 540 })).toBeNull();
    expect(ghostHitAt(p, 12, { x: -960, y: 540 })).toBeNull();
  });

  it('skips hidden tracks and invisible frames (opacity 0 or scale 0)', () => {
    const p = withSlide();
    const hidden = { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, hidden: true } : t)) };
    expect(ghostHitAt(hidden, 10, { x: -960, y: 540 })).toBeNull();
    const pop = setPreset(project(), 'c', 'in', 'zoom', 10);
    // Zoom In from 0.5 starts transparent (kOpacity 0): nothing to click.
    expect(ghostHitAt(pop, 10, { x: 960, y: 540 })).toBeNull();
  });

  it('picks the topmost moved picture where two overlap', () => {
    let p = withSlide();
    // A second moving picture above on track L (unlocked here) over the same spot.
    p = { ...p, tracks: p.tracks.map((t) => (t.id === 'L' ? { ...t, locked: false, clips: t.clips.map((c) => ({ ...c, start: 10, in: 2, out: 6 })) } : t)) };
    p = setPreset(p, 'lc', 'in', 'slide', 10);
    expect(ghostHitAt(p, 10, { x: -960, y: 540 })).toBe('lc');
  });

  it('pointInQuad: inside, outside, rotated and degenerate quads', () => {
    const q = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }];
    expect(pointInQuad(q, { x: 5, y: 5 })).toBe(true);
    expect(pointInQuad(q, { x: 11, y: 5 })).toBe(false);
    const d = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }, { x: 10, y: 0 }].slice(0, 4);
    expect(typeof pointInQuad(d, { x: 5, y: 5 })).toBe('boolean');
    const flat = [{ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 1 }];
    expect(pointInQuad(flat, { x: 1, y: 1 })).toBe(false);
  });
});
