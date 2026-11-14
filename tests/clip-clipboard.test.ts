// Clip copy, paste and duplicate (pure core): relative timing, new ids, deep snapshot, multi-clip / multi-track,
// atomic refusals (locked, overlap, kind, media), repeated paste of one copy, input never mutated.
import { describe, expect, it } from 'vitest';
import { copyClips, duplicateClips, pasteClips } from '../src/core/clipClipboard';
import { clipEnd, defaultClipAudio, defaultTransform } from '../src/core/model';
import type { Clip, Project, Track } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { CURRENT_VERSION } from './helpers/project';

const mk = (id: string, start: number, dur: number, over: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm1', kind: 'video', start, in: 1, out: 1 + dur, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...over,
});
const track = (id: string, kind: Track['kind'], clips: Clip[], over: Partial<Track> = {}): Track =>
  ({ id, kind, name: '', hidden: false, muted: false, solo: false, locked: false, volume: 1, duck: null, clips, ...over });

const rich = (id: string, start: number): Clip => mk(id, start, 2, {
  transform: { x: 30, y: -20, scale: 1.5, rotation: 12, opacity: 0.8 },
  effects: [{ id: 'fx1', type: 'colour', enabled: true, params: { brightness: 0.2 }, keys: { brightness: [{ t: 0, v: 0, ease: { kind: 'linear' } }, { t: 1, v: 0.5, ease: { kind: 'linear' } }] } }],
  keys: { opacity: [{ t: 0, v: 0, ease: { kind: 'linear' } }, { t: 1, v: 1, ease: { kind: 'linear' } }] },
  motion: { in: { preset: 'fade', duration: 0.5, delay: 0, ease: { kind: 'linear' }, params: {} } },
  audio: { ...defaultClipAudio(), fadeIn: 0.2, effects: [{ id: 'ae1', type: 'gain', enabled: true, params: { gainDb: 3 } }] },
});

function proj(over: Partial<Project> = {}): Project {
  return {
    version: CURRENT_VERSION,
    format: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      track('v1', 'video', [rich('A', 10), mk('B', 14, 2)]),
      track('v2', 'video', [mk('C', 11, 1)]),
      track('a1', 'audio', [mk('D', 10, 3, { kind: 'audio' })]),
    ],
    media: { m1: { id: 'm1', name: 'a.mp4', kind: 'video', duration: 20, width: 1920, height: 1080, fps: 30, hasAudio: true } },
    ...over,
  };
}
const all = (p: Project): Clip[] => p.tracks.flatMap((t) => t.clips);
const on = (p: Project, id: string): Clip[] => p.tracks.find((t) => t.id === id)!.clips;
const refusal = (fn: () => unknown): string => {
  try { fn(); } catch (e) { expect(e).toBeInstanceOf(TimelineError); return (e as Error).message; }
  throw new Error('expected a TimelineError');
};

describe('copyClips', () => {
  it('snapshots clips with start offsets from the earliest and track offsets from the topmost track', () => {
    const p = proj();
    const pl = copyClips(p, ['C', 'A', 'B']);
    expect(pl.clips.map((c) => [c.clip.id, c.offset, c.trackOffset])).toEqual([['A', 0, 0], ['C', 1, 1], ['B', 4, 0]]);
    expect(pl.span).toBe(6);
    expect(pl.anchorTrackId).toBe('v1');
    expect(pl.trackSpan).toBe(1);
  });

  it('is a deep copy: later edits of the project never reach it, and it never aliases the project', () => {
    const p = proj();
    const pl = copyClips(p, ['A']);
    expect(pl.clips[0].clip).toEqual(p.tracks[0].clips[0]);
    expect(pl.clips[0].clip).not.toBe(p.tracks[0].clips[0]);
    expect(pl.clips[0].clip.keys!.opacity).not.toBe(p.tracks[0].clips[0].keys!.opacity);
    expect(pl.clips[0].clip.effects[0].keys!.brightness).not.toBe(p.tracks[0].clips[0].effects[0].keys!.brightness);
  });

  it('refuses when nothing is selected or the ids are unknown', () => {
    expect(refusal(() => copyClips(proj(), []))).toMatch(/Select a clip/);
    expect(refusal(() => copyClips(proj(), ['nope']))).toMatch(/Select a clip/);
  });
});

describe('pasteClips', () => {
  const at = (time: number, trackId = 'v1') => ({ time, trackId });

  it('lands the earliest clip at the time, with new ids and everything else equal; media reused', () => {
    const p = proj();
    const r = pasteClips(p, copyClips(p, ['A']), at(30));
    const added = on(r, 'v1').filter((c) => !['A', 'B'].includes(c.id));
    expect(added).toHaveLength(1);
    const n = added[0];
    expect(n.start).toBe(30);
    expect(n.id).not.toBe('A');
    expect({ ...n, id: 'A', start: 10, effects: n.effects.map((e) => ({ ...e, id: 'fx1' })), audio: { ...n.audio, effects: n.audio.effects.map((e) => ({ ...e, id: 'ae1' })) } }).toEqual(p.tracks[0].clips[0]);
    expect(n.effects[0].id).not.toBe('fx1');
    expect(n.audio.effects[0].id).not.toBe('ae1');
    expect(n.mediaId).toBe('m1');
    expect(Object.keys(r.media)).toEqual(['m1']);
    expect(on(r, 'v1').map((c) => c.start)).toEqual([10, 14, 30]);
  });

  it('snaps the time to the project frame', () => {
    const p = proj();
    const r = pasteClips(p, copyClips(p, ['A']), at(30.0167));
    expect(on(r, 'v1').find((c) => c.start > 20)!.start).toBeCloseTo(30, 9);
    const r2 = pasteClips(p, copyClips(p, ['A']), at(30.04));
    expect(on(r2, 'v1').find((c) => c.start > 20)!.start).toBeCloseTo(31 / 30 + 29, 9);
  });

  it('keeps relative start offsets of several clips on one track', () => {
    const p = proj();
    const r = pasteClips(p, copyClips(p, ['A', 'B']), at(40));
    const starts = on(r, 'v1').map((c) => c.start);
    expect(starts).toEqual([10, 14, 40, 44]);
  });

  it('multi-track payload keeps the relative track offset', () => {
    const p = proj();
    const r = pasteClips(p, copyClips(p, ['A', 'C']), at(40));
    expect(on(r, 'v1').map((c) => c.start)).toEqual([10, 14, 40]);
    expect(on(r, 'v2').map((c) => c.start)).toEqual([11, 41]);
  });

  it('a multi-track payload near the last track moves up to fit', () => {
    const three = proj({ tracks: [track('v1', 'video', [rich('A', 10)]), track('v2', 'video', [mk('C', 11, 1)]), track('v3', 'video', [])] });
    // Payload v1+v2 pasted with target v3: base would be v3/(none) -> moved up to v2/v3.
    const r = pasteClips(three, copyClips(three, ['A', 'C']), at(40, 'v3'));
    expect(on(r, 'v2').map((c) => c.start)).toEqual([11, 40]);
    expect(on(r, 'v3').map((c) => c.start)).toEqual([41]);
  });

  it('kind mismatches map each payload track to the nearest track of the same kind, in order, atomically', () => {
    const p = proj();
    // Video v1+v2 with target v2 (v3 would be audio): moves up onto v1/v2.
    const up = pasteClips(p, copyClips(p, ['A', 'C']), at(40, 'v2'));
    expect(on(up, 'v1').map((c) => c.start)).toEqual([10, 14, 40]);
    expect(on(up, 'v2').map((c) => c.start)).toEqual([11, 41]);
    // Video v2 + audio a1 pasted with target v1: video on v1, its audio on the next audio track.
    const va = pasteClips(p, copyClips(p, ['C', 'D']), at(40, 'v1'));
    expect(on(va, 'v1').map((c) => c.start)).toEqual([10, 14, 41]);
    expect(on(va, 'a1').map((c) => c.start)).toEqual([10, 40]);
    expect(on(va, 'v2').map((c) => c.start)).toEqual([11]);
    expect(all(p)).toHaveLength(4);
  });

  const inter = (): Project => proj({
    tracks: [
      track('v1', 'video', [mk('A', 10, 2)]), track('a1', 'audio', [mk('AA', 10, 2, { kind: 'audio' })]),
      track('v2', 'video', []), track('a2', 'audio', []), track('v3', 'video', []), track('a3', 'audio', []),
    ],
  });

  it('interleaved video/audio tracks: a clip and its detached audio keep their order on any target; one copy pastes at several places', () => {
    const p = inter();
    const pl = copyClips(p, ['A', 'AA']); // raw offsets 0 and 1
    let r = pasteClips(p, pl, at(30, 'v2'));
    expect(on(r, 'v2').map((c) => c.start)).toEqual([30]);
    expect(on(r, 'a2').map((c) => c.start)).toEqual([30]);
    r = pasteClips(r, pl, at(40, 'v3'));
    expect(on(r, 'v3').map((c) => c.start)).toEqual([40]);
    expect(on(r, 'a3').map((c) => c.start)).toEqual([40]);
    r = pasteClips(r, pl, at(50, 'v1'));
    expect(on(r, 'v1').map((c) => c.start)).toEqual([10, 50]);
    expect(on(r, 'a1').map((c) => c.start)).toEqual([10, 50]);
    // Target the AUDIO track a2: the video clip goes to the nearest following video track (v3), its audio after it (a3).
    const s = pasteClips(p, pl, at(60, 'a2'));
    expect(on(s, 'v3').map((c) => c.start)).toEqual([60]);
    expect(on(s, 'a3').map((c) => c.start)).toEqual([60]);
    // Payload with a gap between tracks (v1 and v2 only, a1 skipped) still maps in order.
    const gap = copyClips(r, ['A', on(r, 'v2')[0].id]);
    expect(gap.trackSpan).toBe(2);
    const g = pasteClips(inter(), gap, at(70, 'v3'));
    expect(on(g, 'v2').map((c) => c.start)).toEqual([70]); // moved up so both video tracks fit
    expect(on(g, 'v3').map((c) => c.start)).toEqual([90]);
  });

  it('refuses atomically with a clear message when no matching track exists', () => {
    const onlyVideo = proj({ tracks: [track('v1', 'video', [mk('A', 10, 2)]), track('v2', 'video', [])] });
    const pl = copyClips(proj(), ['C', 'D']); // video + audio
    expect(refusal(() => pasteClips(onlyVideo, pl, at(40, 'v1')))).toMatch(/Not enough tracks of the right kind/);
    expect(all(onlyVideo)).toHaveLength(1);
    const audioFirst = proj({ tracks: [track('a1', 'audio', []), track('v1', 'video', [])] });
    expect(refusal(() => pasteClips(audioFirst, pl, at(40, 'v1')))).toMatch(/Not enough tracks of the right kind/);
  });

  it('atomic when the LAST planned clip is the refused one: the earlier tracks are untouched', () => {
    const p = proj({ tracks: [track('v1', 'video', []), track('v2', 'video', [mk('X', 41, 2)])] });
    const pl = copyClips(proj(), ['A', 'C']); // A on v1 at 0, C on v2 at +1
    const before = JSON.stringify(p);
    expect(refusal(() => pasteClips(p, pl, at(40)))).toMatch(/overlap a clip on track 2/);
    expect(JSON.stringify(p)).toBe(before);
    expect(on(p, 'v1')).toHaveLength(0);
    const locked = proj({ tracks: [track('v1', 'video', []), track('v2', 'video', [], { locked: true })] });
    expect(refusal(() => pasteClips(locked, pl, at(40)))).toMatch(/locked/);
    expect(on(locked, 'v1')).toHaveLength(0);
  });

  it('refuses a payload that needs more tracks than the project has', () => {
    const p = proj({ tracks: [track('v1', 'video', [mk('A', 0, 1)])] });
    const pl = { ...copyClips(proj(), ['A', 'C']) };
    expect(refusal(() => pasteClips(p, pl, at(5)))).toMatch(/Not enough tracks/);
  });

  it('refuses a locked track, an overlap and a wrong kind; nothing is produced (atomic, nothing partial)', () => {
    const p = proj({ tracks: proj().tracks.map((t) => (t.id === 'v2' ? { ...t, locked: true } : t)) });
    expect(refusal(() => pasteClips(p, copyClips(p, ['C']), at(40, 'v2')))).toMatch(/Cannot paste: the track .* is locked/);
    // Multi-clip: the second clip (B at +4) overlaps, so the FIRST must not be pasted either.
    const q = proj();
    const pl = copyClips(q, ['A', 'B']);
    const msg = refusal(() => pasteClips(q, pl, at(6)));
    expect(msg).toMatch(/Cannot paste: it would overlap a clip on track 1\. Move the playhead/);
    expect(all(q)).toHaveLength(4);
    const noAudio = proj({ tracks: q.tracks.slice(0, 2) });
    expect(refusal(() => pasteClips(noAudio, copyClips(q, ['D']), at(40, 'v1')))).toMatch(/Not enough tracks of the right kind/);
  });

  it('refuses when the media of a copied clip is gone', () => {
    const p = proj();
    const pl = copyClips(p, ['A']);
    expect(refusal(() => pasteClips({ ...p, media: {} }, pl, at(40)))).toMatch(/media/);
  });

  it('refuses an unknown track and a non-finite time', () => {
    const p = proj();
    expect(refusal(() => pasteClips(p, copyClips(p, ['A']), at(40, 'zz')))).toMatch(/Choose a track/);
    expect(refusal(() => pasteClips(p, copyClips(p, ['A']), at(Number.NaN)))).toMatch(/Invalid/);
  });

  it('one copy pastes at many places (repeated), each a fresh clip; the payload is untouched', () => {
    const p = proj();
    const pl = copyClips(p, ['A']);
    const before = JSON.stringify(pl);
    let r = p;
    for (const t of [20, 30, 50]) r = pasteClips(r, pl, at(t));
    expect(on(r, 'v1').map((c) => c.start)).toEqual([10, 14, 20, 30, 50]);
    expect(new Set(all(r).map((c) => c.id)).size).toBe(all(r).length);
    expect(new Set(all(r).flatMap((c) => c.effects.map((e) => e.id))).size).toBe(4);
    expect(JSON.stringify(pl)).toBe(before);
  });

  it('never mutates the input project', () => {
    const p = proj();
    const snap = JSON.stringify(p);
    pasteClips(p, copyClips(p, ['A', 'C']), at(40));
    expect(JSON.stringify(p)).toBe(snap);
    expect(refusal(() => pasteClips(p, copyClips(p, ['A']), at(10)))).toMatch(/overlap/);
    expect(JSON.stringify(p)).toBe(snap);
  });

  it('pasted keys are independent copies (editing the paste cannot touch the source)', () => {
    const p = proj();
    const pl = copyClips(p, ['A']);
    const r = pasteClips(p, pl, at(40));
    const n = on(r, 'v1').find((c) => c.start === 40)!;
    expect(n.keys!.opacity).not.toBe(pl.clips[0].clip.keys!.opacity);
    expect(n.motion).not.toBe(pl.clips[0].clip.motion);
    expect(n.keys!.opacity).not.toBe(p.tracks[0].clips[0].keys!.opacity);
    expect(n.motion).not.toBe(p.tracks[0].clips[0].motion);
  });

  it('an empty payload is a no-op: the same project', () => {
    const p = proj();
    const pl = { ...copyClips(p, ['A']), clips: [] };
    expect(pasteClips(p, pl, at(40))).toBe(p);
  });

  it('negative time clamps to 0', () => {
    const p = proj();
    const r = pasteClips(p, copyClips(p, ['C']), at(-5, 'v2'));
    expect(on(r, 'v2').map((c) => c.start)).toEqual([0, 11]);
  });
});

describe('duplicateClips', () => {
  it('pastes right after the end of the selection on the same track', () => {
    const p = proj();
    const r = duplicateClips(p, ['A']);
    const n = on(r, 'v1').find((c) => !['A', 'B'].includes(c.id))!;
    expect(n.start).toBe(clipEnd(p.tracks[0].clips[0]));
    expect(n.id).not.toBe('A');
  });

  it('a selection of several clips duplicates as a block after the latest end, tracks kept', () => {
    const p = proj();
    const r = duplicateClips(p, ['A', 'C']);
    // Selection ends at 12 (A 10..12, C 11..12): the block starts at 12 -> A copy 12, C copy 13.
    expect(on(r, 'v1').map((c) => c.start)).toEqual([10, 12, 14]);
    expect(on(r, 'v2').map((c) => c.start)).toEqual([11, 13]);
  });

  it('refuses when the next clip is in the way (overlap), a locked track; atomic', () => {
    const blocked = proj({ tracks: [track('v1', 'video', [mk('A', 10, 2), mk('B', 14, 2), mk('X', 17, 1)]), ...proj().tracks.slice(1)] });
    expect(refusal(() => duplicateClips(blocked, ['A', 'B']))).toMatch(/overlap/);
    expect(all(blocked)).toHaveLength(5);
    const locked = proj({ tracks: proj().tracks.map((t) => (t.id === 'v1' ? { ...t, locked: true } : t)) });
    expect(refusal(() => duplicateClips(locked, ['B']))).toMatch(/Cannot paste: the track .* is locked/);
    const crowded = proj({ tracks: [track('v1', 'video', [mk('A', 0, 2), mk('B', 2.5, 2)]), ...proj().tracks.slice(1)] });
    expect(refusal(() => duplicateClips(crowded, ['A']))).toMatch(/overlap/);
  });

  it('duplicating an audio clip stays on its audio track', () => {
    const p = proj();
    const r = duplicateClips(p, ['D']);
    expect(on(r, 'a1').map((c) => c.start)).toEqual([10, 13]);
  });
});
