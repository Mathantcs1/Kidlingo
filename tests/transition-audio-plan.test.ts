// Plan 5C Task 6: planWindow extends a transitioned clip's audible span into its handles, for plain and retimed clips.
import { describe, it, expect } from 'vitest';
import { crossfadeInfo } from '../src/audio/crossfade';
import { clipDuckPoints } from '../src/audio/duck';
import { audibleClips, planWindow, trackVolumes } from '../src/audio/plan';
import { audioSpan, footageToDecode } from '../src/audio/retime/retimeMath';
import { clipDuration } from '../src/core/clipTime';
import { addTransition } from '../src/core/transitionEdits';
import type { Project } from '../src/core/model';
import { base, mk } from './transition-fixtures';

const withT = (): Project => addTransition(base(), 'v', 'a', 'b', { type: 'dissolve', duration: 1 });
const plan = (p: Project, from: number, to: number) => {
  const clips = audibleClips(p);
  return planWindow(clips, from, to, trackVolumes(p), clipDuckPoints(p), crossfadeInfo(p, clips));
};
const seg = (segs: ReturnType<typeof plan>, id: string) => segs.find((s) => s.clipId === id)!;

describe('planWindow with crossfades', () => {
  it('the outgoing clip plays 0.5 s past its end (source past `out`), the incoming 0.5 s before its start', () => {
    const segs = plan(withT(), 0, 100);
    const a = seg(segs, 'a');
    const b = seg(segs, 'b');
    expect([a.when, a.whenEnd, a.srcFrom, a.srcTo]).toEqual([0, 4.5, 2, 6.5]);
    expect([b.when, b.whenEnd, b.srcFrom, b.srcTo]).toEqual([3.5, 8, 1.5, 6]);
    expect(a.xfade?.after).toBe(0.5);
  });
  it('a window cut inside the handle is the same number on both sides', () => {
    const p = withT();
    const left = seg(plan(p, 0, 4.2), 'a');
    const right = seg(plan(p, 4.2, 100), 'a');
    expect(left.whenEnd).toBe(right.when);
    expect(left.srcTo).toBe(right.srcFrom);
  });
  it('a window that only touches the handle plans the clip there; a window after it does not', () => {
    const p = withT();
    expect(plan(p, 4.2, 4.4).some((s) => s.clipId === 'a')).toBe(true);
    expect(plan(p, 4.5, 6).some((s) => s.clipId === 'a')).toBe(false);
  });
  it('without transitions the plan is deep-equal to the one planned without crossfades', () => {
    const p = base();
    const clips = audibleClips(p);
    expect(plan(p, 0, 100)).toEqual(planWindow(clips, 0, 100, trackVolumes(p), clipDuckPoints(p)));
    expect(plan(p, 0, 100).every((s) => s.xfade === undefined)).toBe(true);
  });
  it('a retimed clip plans virtual time past [0, D] (2x: 8 s of footage = 4 s, so D + 0.5)', () => {
    const p = addTransition(base([mk('a', 0, 2, 10, { speed: 2 }), mk('b', 4, 2, 6)]), 'v', 'a', 'b', { type: 'dissolve', duration: 1 });
    const a = seg(plan(p, 0, 100), 'a');
    expect([a.srcFrom, a.srcTo]).toEqual([0, clipDuration(mk('a', 0, 2, 10, { speed: 2 })) + 0.5]);
    const b = seg(plan(p, 0, 100), 'b');
    expect(b.srcFrom).toBe(1.5); // plain clip: footage 0.5 s before `in`
  });
});

describe('decode spans', () => {
  it('a plain clip decodes past in/out only on a crossfaded side; a retimed one past [0, D]', () => {
    const c = mk('a', 0, 2, 6);
    expect(audioSpan(c)).toEqual([2, 6]);
    expect(audioSpan(c, { before: 0, after: 0.5 })).toEqual([2, Infinity]);
    expect(audioSpan(c, { before: 0.5, after: 0 })).toEqual([-Infinity, 6]);
    const r = mk('a', 0, 2, 10, { speed: 2 });
    expect(audioSpan(r, { before: 0.25, after: 0.5 })).toEqual([-0.25, 4.5]);
    expect(footageToDecode(r, -0.25, 0.1, 48000, { before: 0.25, after: 0 })[0]).toBeLessThan(2);
    expect(footageToDecode(r, 0, 0.1, 48000)[0]).toBeGreaterThanOrEqual(2);
  });
});

describe('duck coverage', () => {
  it('a ducked track also dips while a handle sounds', () => {
    const p = withT();
    p.tracks.push({ ...p.tracks[0], id: 'm', kind: 'audio', clips: [], transitions: undefined, duck: { sourceTrackId: 'v', amountDb: -12, attack: 0.1, release: 0.1 } } as never);
    const m = p.tracks.find((t) => t.id === 'm')!;
    m.clips = [mk('z', 0, 0, 20, { kind: 'audio', mediaId: 'm1' })];
    const pts = clipDuckPoints(p).get('z')!;
    // The video clips span 0..12 and a's handle ends at 4.5 inside it: the covered interval is unchanged but still valid.
    expect(pts.length).toBeGreaterThan(0);
    const only = addTransition(base([mk('a', 0, 2, 6), mk('b', 4, 2, 6)]), 'v', 'a', 'b', { type: 'dissolve', duration: 1 });
    only.tracks.push({ ...only.tracks[0], id: 'm', kind: 'audio', clips: [mk('z', 0, 0, 20, { kind: 'audio', mediaId: 'm1' })], transitions: undefined, duck: { sourceTrackId: 'v', amountDb: -12, attack: 0.1, release: 0.1 } } as never);
    const last = clipDuckPoints(only).get('z')!;
    expect(last[last.length - 2].t).toBeCloseTo(8, 9); // b ends at 8: the b-side has no handle after it
  });
});
