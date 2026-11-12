// Plan 5 Task 11 (Ruling P5-3, Task 4 note M2): scale 0 is a legal, invisible picture, never a NaN. Every ease
// driving scale to 0 (and undershooting below it), a static scale 0 under keyed position/rotation/opacity, and the
// static 0 written by "animation off" at an overshoot frame stay finite through the resolver, the draw matrix, the
// handle corners, the motion path and the overlay texture size, at every frame.
import { describe, expect, it } from 'vitest';
import { resolveClip, resolvedTransform } from '../src/core/animate';
import { setAnimated, setValueAt } from '../src/core/keyframeEdits';
import { setTransformAt, withLiveValue } from '../src/core/transformKeyEdits';
import type { Ease } from '../src/core/easing';
import type { Clip, Transform } from '../src/core/model';
import { clipMatrix } from '../src/render/geometry';
import { clipCorners } from '../src/render/overlayGeometry';
import { overlayTextureSize } from '../src/render/overlays/textures';
import { sampleMotionPath } from '../src/ui/motionPathMath';
import { clipOf, k, pk, project } from './keyframe-fixtures';

const FPS = 30;
const FORMAT = { width: 1920, height: 1080 };
const EASES: Ease[] = [
  { kind: 'linear' }, { kind: 'hold' }, { kind: 'easeIn' }, { kind: 'easeOut' }, { kind: 'easeInOut' }, { kind: 'back' },
  { kind: 'elastic' }, { kind: 'bounce' }, { kind: 'bezier', bezier: [0.3, -1, 0.7, 2] },
];
const scaleScope = { scale: 0, rotation: 0 };

function expectFinite(tr: Transform, what: string): void {
  for (const v of Object.values(tr)) expect(Number.isFinite(v), `${what}: ${JSON.stringify(tr)}`).toBe(true);
  expect(tr.scale, what).toBeGreaterThanOrEqual(0);
  expect(clipMatrix({ width: 200, height: 100 }, tr, FORMAT).every(Number.isFinite), `${what} matrix`).toBe(true);
  expect(clipCorners({ width: 200, height: 100 }, tr, FORMAT).every((c) => Number.isFinite(c.x) && Number.isFinite(c.y)), `${what} corners`).toBe(true);
  const tex = overlayTextureSize({ width: 300, height: 80 }, tr.scale, 1, 2048);
  expect(tex.width >= 1 && tex.height >= 1 && Number.isFinite(tex.width * tex.height), `${what} texture`).toBe(true);
}

/** Every frame of `clip` (0..2 s in the fixture: the clip 'c' runs 10..14 s, source from 2 s). */
function everyFrame(clip: Clip, what: string): void {
  for (let f = 0; f <= 4 * FPS; f++) {
    const t = clip.start + f / FPS;
    expectFinite(resolvedTransform(clip, t, FPS), `${what} frame ${f}`);
    const r = resolveClip(clip, t, FPS);
    for (const e of r.effects) for (const v of Object.values(e.params)) expect(Number.isFinite(v)).toBe(true);
  }
  const path = sampleMotionPath(clip, FPS, FORMAT);
  for (const pt of [...path.runs.flat(), ...path.keys]) expect(Number.isFinite(pt.x) && Number.isFinite(pt.y), `${what} path`).toBe(true);
}

describe('scale 0 never produces NaN', () => {
  for (const ease of EASES) {
    it(`scale keys 2 -> 0 -> 0.5 with ${ease.kind} (undershoot clamped to 0) under keyed position and rotation`, () => {
      const p = project({
        transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
        keys: {
          scale: [k(2, 2, ease), k(3, 0, ease), k(4, 0.5)],
          position: [pk(2, -300, 0, ease), pk(5, 300, 100)],
          rotation: [k(2, 0, ease), k(6, 720)],
        },
      });
      everyFrame(clipOf(p, 'c'), ease.kind);
    });
  }

  it('static scale 0 with keyed position, rotation and opacity', () => {
    const p = project({
      transform: { x: 1e7, y: -1e7, scale: 0, rotation: 33, opacity: 1 },
      keys: { position: [pk(2, -1e7, 1e7), pk(6, 1e7, -1e7, { kind: 'elastic' })], rotation: [k(2, -36000), k(6, 36000)], opacity: [k(2, 0), k(6, 1, { kind: 'back' })] },
    });
    everyFrame(clipOf(p, 'c'), 'static 0');
  });

  it('"animation off" at a frame where the keys reach 0 stores a static 0 that renders and edits without NaN', () => {
    const p = project({ keys: { scale: [k(2, 1, { kind: 'back' }), k(3, 0)] } });
    // Timeline 11.0 s = local 3.0 s: the key at 0.
    const off = setAnimated(p, 'c', { kind: 'transform', prop: 'scale' }, false, 11);
    const c = clipOf(off, 'c');
    expect(c.transform.scale).toBe(0);
    expect(c.keys?.scale).toBeUndefined();
    everyFrame(c, 'static 0 from off');
    // Turning it back on keys the 0; a typed value then writes a finite key; a keyed drag from 0 stays finite.
    const on = setAnimated(off, 'c', { kind: 'transform', prop: 'scale' }, true, 11);
    expect(clipOf(on, 'c').keys!.scale!.map((q) => q.v)).toEqual([0]);
    const typed = setValueAt(on, 'c', { kind: 'transform', prop: 'scale' }, 0.5, 12);
    everyFrame(clipOf(typed, 'c'), 'typed after 0');
    for (const q of [setTransformAt(on, 'c', { ...scaleScope, x: 40 }, 11), withLiveValue(on, 'c', { ...scaleScope, y: -40 }, 11)]) {
      everyFrame(clipOf(q, 'c'), 'drag at 0');
    }
  });
});
