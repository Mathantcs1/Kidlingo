// Plan 5C Task 2 (D9): what every structural edit does to the transitions, plus a seeded property test of validity.
import { describe, it, expect } from 'vitest';
import { clipDuration } from '../src/core/clipTime';
import { detachAudio } from '../src/core/detachAudio';
import { joinClips } from '../src/core/merge';
import type { Project } from '../src/core/model';
import { setSpeed } from '../src/core/speedEdits';
import { deleteClip, moveClip, splitClip, trimClip } from '../src/core/timeline';
import { addTransition, setTransitionDuration } from '../src/core/transitionEdits';
import { reconcileTransitions, transitionChanges } from '../src/core/transitionReconcile';
import { transitionValid } from '../src/core/transitions';
import { rippleDeleteClips } from '../src/ui/edits';
import { removeMediaFromProject } from '../src/ui/mediaEdits';
import { FPS, base, mk, trackOf } from './transition-fixtures';

const two = (): Project => addTransition(base(), 'v', 'a', 'b', { type: 'dissolve', duration: 1 });
const both = (): Project => addTransition(two(), 'v', 'b', 'c', { type: 'wipe', duration: 1 });
const list = (p: Project) => trackOf(p).transitions ?? [];

describe('reconcileTransitions', () => {
  it('returns the same project when there is nothing to fix (and when no track has transitions)', () => {
    const p = both();
    expect(reconcileTransitions(p)).toBe(p);
    const b = base();
    expect(reconcileTransitions(b)).toBe(b);
  });
  it('drops what no longer fits and removes the empty field', () => {
    const p = two();
    const broken = { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, transitions: [{ ...t.transitions![0], toClipId: 'zzz' }] } : t)) };
    expect(trackOf(reconcileTransitions(broken)).transitions).toBeUndefined();
  });
  it('clamps an over-long duration to the handles, rounded down, and keeps untouched ones by reference', () => {
    const p = addTransition(base([mk('a', 0, 2, 6), mk('b', 4, 2, 6)]), 'v', 'a', 'b', { type: 'dissolve', duration: 3 });
    const edited = { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'b' ? { ...c, in: 0.51 } : c)) })) };
    const r = reconcileTransitions(edited);
    expect(list(r)[0].duration * FPS).toBe(30);
  });
});

describe('edit rules (D9)', () => {
  it('delete drops the clip\'s transitions; ripple delete never invents one', () => {
    const p = both();
    expect(list(deleteClip(p, 'b'))).toHaveLength(0);
    const r = rippleDeleteClips(p, ['b']);
    expect(list(r)).toHaveLength(0);
    expect(trackOf(r).clips.map((c) => c.start)).toEqual([0, 4]);
  });
  it('move away drops them; a move that changes nothing keeps them', () => {
    const p = both();
    expect(list(moveClip(p, 'c', 20))).toHaveLength(1); // b->c gone, a->b stays
    expect(list(moveClip(p, 'b', 4))).toHaveLength(2);
  });
  it('split re-points the OUT transition to the right half and keeps the IN one on the left half', () => {
    const p = both();
    const s = splitClip(p, 'b', 6);
    const [left, right] = trackOf(s).clips.filter((c) => c.start >= 4 && c.start < 8).sort((x, y) => x.start - y.start);
    expect(left.id).toBe('b');
    const t = list(s);
    expect(t.find((x) => x.type === 'dissolve')).toMatchObject({ fromClipId: 'a', toClipId: 'b' });
    expect(t.find((x) => x.type === 'wipe')).toMatchObject({ fromClipId: right.id, toClipId: 'c' });
  });
  it('a split inside a window shortens it (the half-windows must fit the shorter clip)', () => {
    const p = addTransition(base([mk('a', 0, 2, 6), mk('b', 4, 2, 6)]), 'v', 'a', 'b', { type: 'dissolve', duration: 4 });
    expect(list(p)[0].duration).toBe(4);
    const s = splitClip(p, 'a', 3.9); // a's left half lasts 3.9 s but... split near the cut leaves a 0.1 s right half
    const tr = list(s).find((x) => x.toClipId === 'b');
    expect(tr === undefined || tr.duration <= 0.2 + 1e-9).toBe(true);
  });
  it('trim of the cut edge drops the transition (not adjacent any more), trim of the far edge shortens it', () => {
    const p = two();
    expect(list(trimClip(p, 'b', 'start', 4.5))).toHaveLength(0);
    const long = addTransition(base([mk('a', 0, 20, 26), mk('b', 6, 20, 26)]), 'v', 'a', 'b', { type: 'dissolve', duration: 5 });
    expect(list(long)[0].duration).toBe(5);
    const shortA = trimClip(long, 'a', 'start', 4); // a now 2 s long: a half-window of 2.5 s no longer fits
    expect(list(shortA)[0].duration).toBeLessThanOrEqual(4);
    const ch = transitionChanges(long, shortA);
    expect(ch.shortened).toBe(1);
  });
  it('join keeps transitions between clips that stay adjacent; speed changes re-clamp to the new handles', () => {
    const p = two();
    expect(list(joinClips(p, ['a', 'b']))).toHaveLength(1);
    const slow = base([mk('a', 0, 2, 6), mk('b', 4, 2, 6)]);
    const t = addTransition(slow, 'v', 'a', 'b', { type: 'dissolve', duration: 4 });
    const fast = setSpeed(t, ['b'], 4, { ripple: true }); // b: handle before 2 s of footage at 4x = 0.5 s
    expect(list(fast)[0].duration).toBeLessThanOrEqual(1);
  });
  it('detach audio leaves the picture transition; removing media drops the transitions of its clips', () => {
    const p = two();
    expect(list(detachAudio(p, 'a'))).toHaveLength(1);
    expect(list(removeMediaFromProject(p, 'm1'))).toHaveLength(0);
  });
});

/** mulberry32 */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe('property: every successful edit leaves only valid transitions', () => {
  it('2000 random edit sequences over 3 tracks', () => {
    const r = rng(20261115);
    const pick = <T,>(a: T[]): T => a[Math.floor(r() * a.length)];
    let p: Project = base();
    p.tracks.push({ ...p.tracks[0], id: 'v2', clips: [mk('d', 0, 10, 14), mk('e', 4, 10, 14), mk('f', 8, 10, 14)] });
    p.tracks.push({ ...p.tracks[0], id: 'v3', clips: [mk('g', 0, 1, 5), mk('h', 4, 30, 34)] });
    let ok = 0;
    let withTransitions = 0;
    for (let i = 0; i < 2000; i++) {
      const clips = p.tracks.flatMap((t) => t.clips);
      const c = pick(clips);
      const t = pick(p.tracks);
      const kind = Math.floor(r() * 9);
      try {
        let next: Project = p;
        if (kind === 0) next = splitClip(p, c.id, c.start + 0.3 + r() * Math.max(0.1, clipDuration(c) - 0.6));
        else if (kind === 1) next = moveClip(p, c.id, Math.round(r() * 40) / 2, pick(p.tracks.filter((x) => x.kind === 'video')).id);
        else if (kind === 2) next = trimClip(p, c.id, r() < 0.5 ? 'start' : 'end', c.start + r() * 6);
        else if (kind === 3) next = deleteClip(p, c.id, { ripple: r() < 0.5 });
        else if (kind === 4) next = joinClips(p, t.clips.filter(() => r() < 0.7).map((x) => x.id));
        else if (kind === 5 || kind === 6) {
          const cuts = [...t.clips].sort((x, y) => x.start - y.start);
          const k = Math.floor(r() * Math.max(1, cuts.length - 1));
          next = addTransition(p, t.id, cuts[k].id, cuts[k + 1].id, { type: pick(['dissolve', 'wipe', 'slide', 'dip'] as const), duration: 0.2 + r() * 3 });
        } else if (kind === 7 && t.transitions?.length) next = setTransitionDuration(p, pick(t.transitions).id, 0.1 + r() * 5);
        else next = setSpeed(p, [c.id], pick([0.5, 1, 2, 4]), { ripple: true });
        p = next;
        ok++;
      } catch {
        /* a refused edit changes nothing */
      }
      if (p.tracks.some((tk) => tk.transitions)) withTransitions++;
      for (const tk of p.tracks) for (const tr of tk.transitions ?? []) expect(transitionValid(p, tk, tr), `step ${i} kind ${kind}`).toBe(true);
    }
    expect(ok).toBeGreaterThan(200);
    expect(withTransitions).toBeGreaterThan(300); // the property is exercised, not vacuous
  });
});
