// Plan 5C Task 10 (D9/O8): copy, paste and duplicate carry a transition only when BOTH its clips are copied.
import { describe, it, expect } from 'vitest';
import { copyClips, duplicateClips, pasteClips } from '../src/core/clipClipboard';
import { addTransition } from '../src/core/transitionEdits';
import { transitionValid } from '../src/core/transitions';
import { newTrack } from '../src/core/model';
import { base as base0, mk, trackOf } from './transition-fixtures';

/** The fixture project plus an empty video track 'v2' (so a paste can land on another track). */
function base(clips?: Parameters<typeof base0>[0]) {
  const p = base0(clips);
  p.tracks.push({ ...newTrack('video'), id: 'v2' });
  return p;
}

/** Clips a 0..4, b 4..8, c 8..12 on 'v' with a dissolve a|b; track 'v2' empty. */
const withT = () => addTransition(base(), 'v', 'a', 'b', { type: 'dissolve', duration: 1 });
const ids = (p: ReturnType<typeof base>, track: string) => trackOf(p, track).clips.map((c) => c.id);

describe('clipboard carries transitions', () => {
  it('copying both clips of a transitioned cut keeps the transition on paste, with remapped ids (another track too)', () => {
    const p = withT();
    const payload = copyClips(p, ['a', 'b']);
    expect(payload.transitions).toHaveLength(1);
    const q = pasteClips(p, payload, { time: 20, trackId: 'v2' });
    const t = trackOf(q, 'v2').transitions!;
    expect(t).toHaveLength(1);
    const [from, to] = trackOf(q, 'v2').clips;
    expect([t[0].fromClipId, t[0].toClipId]).toEqual([from.id, to.id]);
    expect(t[0].id).not.toBe(trackOf(p).transitions![0].id);
    expect(t[0].type).toBe('dissolve');
    expect(trackOf(q).transitions).toHaveLength(1); // the original is untouched
    expect(transitionValid(q, trackOf(q, 'v2'), t[0])).toBe(true);
  });
  it('copying only one clip of the pair carries no transition', () => {
    const p = withT();
    expect(copyClips(p, ['a']).transitions ?? []).toHaveLength(0);
    const q = pasteClips(p, copyClips(p, ['b']), { time: 20, trackId: 'v2' });
    expect(trackOf(q, 'v2').transitions).toBeUndefined();
  });
  it('a copy is a snapshot: later edits to the project do not change the payload', () => {
    const p = withT();
    const payload = copyClips(p, ['a', 'b']);
    const snap = JSON.stringify(payload);
    pasteClips(p, payload, { time: 20, trackId: 'v2' });
    expect(JSON.stringify(payload)).toBe(snap);
  });
  it('duplicate keeps the pair transitioned; duplicating twice keeps every id unique', () => {
    let p = addTransition(base([mk('a', 0, 2, 6), mk('b', 4, 2, 6)]), 'v', 'a', 'b', { type: 'dissolve', duration: 1 });
    p = duplicateClips(p, ['a', 'b']);
    p = duplicateClips(p, trackOf(p).clips.filter((c) => c.start >= 8).map((c) => c.id)); // the copy, copied again
    const t = trackOf(p).transitions!;
    expect(t).toHaveLength(3);
    expect(new Set(t.map((x) => x.id)).size).toBe(t.length);
    const clipIds = new Set(ids(p, 'v'));
    for (const x of t) expect(clipIds.has(x.fromClipId) && clipIds.has(x.toClipId)).toBe(true);
    for (const x of t) expect(transitionValid(p, trackOf(p), x)).toBe(true);
  });
  it('a pair that no longer meets after the paste (a clip is missing its handle) is dropped or shortened, never invalid', () => {
    const p = addTransition(base([mk('a', 0, 2, 6), mk('b', 4, 2, 6)]), 'v', 'a', 'b', { type: 'dissolve', duration: 1 });
    const payload = copyClips(p, ['a', 'b']);
    const q = pasteClips(p, payload, { time: 20, trackId: 'v2' });
    for (const x of trackOf(q, 'v2').transitions ?? []) expect(transitionValid(q, trackOf(q, 'v2'), x)).toBe(true);
  });
  it('an audio-track transition is carried by an audio paste', () => {
    const p = base();
    const ai = p.tracks.findIndex((t) => t.kind === 'audio');
    p.tracks[ai] = { ...p.tracks[ai], id: 'a', clips: [mk('x', 0, 1, 5, { kind: 'audio' }), mk('y', 4, 1, 5, { kind: 'audio' })] };
    p.media.m1 = { ...p.media.m1 };
    const withA = addTransition(p, 'a', 'x', 'y', { type: 'audio', duration: 0.5 });
    const q = duplicateClips(withA, ['x', 'y']);
    expect((trackOf(q, 'a').transitions ?? []).length).toBe(2);
  });
});
