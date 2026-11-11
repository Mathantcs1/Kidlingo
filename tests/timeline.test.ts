import { describe, it, expect } from 'vitest';
import { defaultClipAudio, emptyProject, defaultTransform, newTrack } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import {
  MIN_CLIP,
  TimelineError,
  findClip,
  addClip,
  trimClip,
  splitClip,
  moveClip,
  deleteClip,
  activeClipsAt,
  timelineDuration,
} from '../src/core/timeline';

const mk = (id: string, over: Partial<Clip> = {}): Clip => ({
  id,
  mediaId: 'm1',
  kind: 'video',
  start: 0,
  in: 0,
  out: 10,
  transform: defaultTransform(),
  volume: 1,
  audio: defaultClipAudio(), effects: [], blend: 'normal',
  fit: 'fit',
  ...over,
});

/** Project with one video clip c1 {start:0,in:0,out:10} on the first video track. */
function withClip(...extra: Clip[]): Project {
  const p = emptyProject();
  const tracks = p.tracks.map((t, i) => (i === 0 ? { ...t, clips: [mk('c1'), ...extra] } : t));
  return { ...p, tracks };
}

describe('timeline', () => {
  it('exports MIN_CLIP', () => {
    expect(MIN_CLIP).toBe(0.05);
  });

  it('findClip finds or throws', () => {
    const p = withClip();
    expect(findClip(p, 'c1').clip.id).toBe('c1');
    expect(() => findClip(p, 'nope')).toThrow(TimelineError);
  });

  it('addClip adds, rejects overlap and wrong kind', () => {
    const p = withClip();
    const t = p.tracks[0].id;
    const q = addClip(p, t, mk('c2', { start: 10 }));
    expect(q.tracks[0].clips).toHaveLength(2);
    expect(p.tracks[0].clips).toHaveLength(1);
    expect(() => addClip(p, t, mk('c3', { start: 5 }))).toThrow(TimelineError);
    expect(() => addClip(p, p.tracks[1].id, mk('c4', { start: 0 }))).toThrow(TimelineError);
    expect(() => addClip(p, 'nope', mk('c5'))).toThrow(TimelineError);
  });

  it('splitClip at t=4', () => {
    const p = withClip();
    const snapshot = JSON.stringify(p);
    const q = splitClip(p, 'c1', 4);
    const [a, b] = q.tracks[0].clips;
    expect([a.start, a.in, a.out]).toEqual([0, 0, 4]);
    expect([b.start, b.in, b.out]).toEqual([4, 4, 10]);
    expect(a.id).toBe('c1');
    expect(b.id).not.toBe(a.id);
    expect(JSON.stringify(p)).toBe(snapshot);
  });

  it('splitClip at boundaries throws', () => {
    const p = withClip();
    for (const t of [0, 10, 0.01, 11]) {
      expect(() => splitClip(p, 'c1', t)).toThrow(TimelineError);
    }
  });

  it('splitClip works at exactly start+0.05 and end-0.05', () => {
    const p = withClip();
    expect(() => splitClip(p, 'c1', 0.05)).not.toThrow();
    expect(() => splitClip(p, 'c1', 9.95)).not.toThrow();
  });

  it('trimClip start and end', () => {
    const p = withClip();
    const s = findClip(trimClip(p, 'c1', 'start', 3), 'c1').clip;
    expect([s.start, s.in, s.out]).toEqual([3, 3, 10]);
    const e = findClip(trimClip(p, 'c1', 'end', 6), 'c1').clip;
    expect([e.start, e.in, e.out]).toEqual([0, 0, 6]);
    expect(findClip(p, 'c1').clip.out).toBe(10);
  });

  it('trimClip rejects too-short results and negative in', () => {
    const p = withClip();
    expect(() => trimClip(p, 'c1', 'end', 0.01)).toThrow(TimelineError);
    expect(() => trimClip(p, 'c1', 'start', 9.99)).toThrow(TimelineError);
    expect(() => trimClip(p, 'c1', 'start', -1)).toThrow(TimelineError);
  });

  it('moveClip overlap throws, clamps negative, ignores self', () => {
    const p = withClip(mk('c2', { start: 10 }));
    expect(() => moveClip(p, 'c2', 5)).toThrow(TimelineError);
    const q = withClip();
    const moved = moveClip(q, 'c1', -5);
    expect(findClip(moved, 'c1').clip.start).toBe(0);
    expect(findClip(moveClip(q, 'c1', 2), 'c1').clip.start).toBe(2);
  });

  it('moveClip across tracks checks kind', () => {
    const p = withClip();
    expect(() => moveClip(p, 'c1', 0, p.tracks[1].id)).toThrow(TimelineError);
    const extra = { ...p, tracks: [...p.tracks, { ...newTrack('video'), id: 'v2' }] };
    const q = moveClip(extra, 'c1', 1, 'v2');
    expect(findClip(q, 'c1').track.id).toBe('v2');
    expect(q.tracks[0].clips).toHaveLength(0);
  });

  it('deleteClip with and without ripple', () => {
    const p = withClip();
    const two = {
      ...p,
      tracks: p.tracks.map((t, i) =>
        i === 0 ? { ...t, clips: [mk('a', { out: 5 }), mk('b', { start: 5, out: 5 })] } : t,
      ),
    };
    const rip = deleteClip(two, 'a', { ripple: true });
    expect(rip.tracks[0].clips.map((c) => [c.id, c.start])).toEqual([['b', 0]]);
    const plain = deleteClip(two, 'a');
    expect(plain.tracks[0].clips.map((c) => [c.id, c.start])).toEqual([['b', 5]]);
    expect(two.tracks[0].clips).toHaveLength(2);
  });

  it('activeClipsAt is half-open and bottom-first', () => {
    const p = withClip(mk('c2', { start: 10 }));
    const ids = activeClipsAt(p, 10).map((c) => c.id);
    expect(ids).toEqual(['c2']);
    expect(activeClipsAt(p, 0).map((c) => c.id)).toEqual(['c1']);
    const q = { ...p, tracks: [...p.tracks, { ...newTrack('video'), id: 'v2', clips: [mk('top', { start: 0, out: 3 })] }] };
    expect(activeClipsAt(q, 1).map((c) => c.id)).toEqual(['c1', 'top']);
  });

  it('timelineDuration', () => {
    expect(timelineDuration(emptyProject())).toBe(0);
    expect(timelineDuration(withClip(mk('c2', { start: 10, out: 5 })))).toBe(15);
  });
});
