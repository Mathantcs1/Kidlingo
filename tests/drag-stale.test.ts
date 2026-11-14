// Plan 5B Task 8: isStaleDrag (shared by the transform drag and the motion path drag) ends a drag when its clip's
// transform, keys (the path) or, when snapshotted, preset stack is replaced by another edit, or the format changes.
import { describe, expect, it } from 'vitest';
import type { Project } from '../src/core/model';
import { isStaleDrag } from '../src/ui/dragStale';
import type { DragSnapshot } from '../src/ui/dragStale';
import { clipOf, pk, project } from './keyframe-fixtures';

const base = project({ keys: { position: [pk(2, 0, 0), pk(3, 10, 10)] }, motion: { loop: { preset: 'float', duration: 2, delay: 0, ease: { kind: 'linear' }, params: {}, phase: 0, count: null } } });
const snap = (p: Project, motion = true): DragSnapshot => {
  const c = clipOf(p, 'c');
  return { clipId: 'c', storeTransform: c.transform, storeKeys: c.keys, ...(motion ? { storeMotion: c.motion } : {}), format: { width: p.format.width, height: p.format.height } };
};
const edit = (p: Project, patch: object): Project => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'c' ? { ...c, ...patch } : c)) })) });

describe('isStaleDrag', () => {
  it('unrelated edits keep the drag; a replaced transform, key list or preset stack ends it', () => {
    const g = snap(base);
    expect(isStaleDrag(g, base, base)).toBe(false);
    expect(isStaleDrag(g, edit(base, { volume: 0.5 }), base)).toBe(false);
    expect(isStaleDrag(g, edit(base, { transform: { ...clipOf(base, 'c').transform } }), base)).toBe(true);
    expect(isStaleDrag(g, edit(base, { keys: { ...clipOf(base, 'c').keys } }), base)).toBe(true);
    expect(isStaleDrag(g, edit(base, { motion: { ...clipOf(base, 'c').motion } }), base)).toBe(true);
    // Without a snapshotted stack (an older caller) a preset change is not a reason.
    expect(isStaleDrag(snap(base, false), edit(base, { motion: {} }), base)).toBe(false);
  });
  it('the clip gone, the format size or the frame rate changed: stale', () => {
    const g = snap(base);
    expect(isStaleDrag(g, { ...base, tracks: base.tracks.map((t) => ({ ...t, clips: [] })) }, base)).toBe(true);
    expect(isStaleDrag(g, { ...base, format: { ...base.format, width: 1080 } }, base)).toBe(true);
    expect(isStaleDrag(g, { ...base, format: { ...base.format, fps: 25 } }, base)).toBe(true);
  });
  it('a locked track ends the drag; an unlocked one is unchanged (M1)', () => {
    const g = snap(base);
    const lock = (p: Project, locked: boolean): Project => ({ ...p, tracks: p.tracks.map((t) => (t.clips.some((c) => c.id === 'c') ? { ...t, locked } : t)) });
    expect(isStaleDrag(g, lock(base, true), base)).toBe(true);
    expect(isStaleDrag(g, lock(base, false), base)).toBe(false);
  });
});
