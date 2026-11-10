import { describe, it, expect } from 'vitest';
import { defaultTransform, emptyProject, newTrack } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import {
  MAX_TRACKS_PER_KIND,
  addTrack,
  isLocked,
  moveTrack,
  removeTrack,
  renameTrack,
  setTrackFlags,
  trackLabel,
} from '../src/core/tracks';

const mk = (id: string): Clip => ({
  id,
  mediaId: 'm1',
  kind: 'video',
  start: 0,
  in: 0,
  out: 5,
  transform: defaultTransform(),
  volume: 1,
  fit: 'fit',
});

const frozen = (p: Project): string => JSON.stringify(p);

describe('addTrack', () => {
  it('puts a new video track directly after the last video track', () => {
    const p = emptyProject(); // [video, audio]
    const q = addTrack(p, 'video');
    expect(q.tracks.map((t) => t.kind)).toEqual(['video', 'video', 'audio']);
    const r = addTrack(q, 'video');
    expect(r.tracks.map((t) => t.kind)).toEqual(['video', 'video', 'video', 'audio']);
  });

  it('appends audio tracks at the end of the array', () => {
    const q = addTrack(emptyProject(), 'audio');
    expect(q.tracks.map((t) => t.kind)).toEqual(['video', 'audio', 'audio']);
  });

  it('honours an explicit index (clamped) and a name', () => {
    const p = emptyProject();
    expect(addTrack(p, 'video', { index: 0, name: 'Top' }).tracks[0].name).toBe('Top');
    expect(addTrack(p, 'audio', { index: 99 }).tracks).toHaveLength(3);
    expect(addTrack(p, 'audio', { index: -4 }).tracks[0].kind).toBe('audio');
  });

  it('throws at the per-kind limit and does not mutate the input', () => {
    let p = emptyProject();
    for (let i = 1; i < MAX_TRACKS_PER_KIND; i++) p = addTrack(p, 'video');
    expect(p.tracks.filter((t) => t.kind === 'video')).toHaveLength(8);
    const before = frozen(p);
    expect(() => addTrack(p, 'video')).toThrow(TimelineError);
    expect(frozen(p)).toBe(before);
    expect(() => addTrack(p, 'audio')).not.toThrow();
  });
});

describe('removeTrack', () => {
  const two = (): Project => {
    const p = addTrack(emptyProject(), 'video');
    return { ...p, tracks: p.tracks.map((t, i) => (i === 1 ? { ...t, clips: [mk('c1')] } : t)) };
  };

  it('refuses a track with clips unless removeClips is set', () => {
    const p = two();
    expect(() => removeTrack(p, p.tracks[1].id)).toThrow(TimelineError);
    const q = removeTrack(p, p.tracks[1].id, { removeClips: true });
    expect(q.tracks).toHaveLength(2);
    expect(q.tracks.flatMap((t) => t.clips)).toEqual([]);
    expect(p.tracks[1].clips).toHaveLength(1);
  });

  it('removes an empty track', () => {
    const p = two();
    expect(removeTrack(p, p.tracks[0].id).tracks).toHaveLength(2);
  });

  it('refuses to remove the last track of a kind', () => {
    const p = emptyProject();
    expect(() => removeTrack(p, p.tracks[0].id)).toThrow(TimelineError);
    expect(() => removeTrack(p, p.tracks[1].id)).toThrow(TimelineError);
  });

  it('refuses a locked track and an unknown id', () => {
    const p = two();
    const locked = setTrackFlags(p, p.tracks[0].id, { locked: true });
    expect(() => removeTrack(locked, p.tracks[0].id, { removeClips: true })).toThrow('Track is locked');
    expect(() => removeTrack(p, 'nope')).toThrow(TimelineError);
  });
});

describe('moveTrack', () => {
  it('reorders keeping clip data, clamps, and returns p for a no-op', () => {
    let p = addTrack(emptyProject(), 'video');
    p = { ...p, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, clips: [mk('c1')] } : t)) };
    const id = p.tracks[0].id;
    const q = moveTrack(p, id, 1);
    expect(q.tracks[1].id).toBe(id);
    expect(q.tracks[1].clips).toEqual([mk('c1')]);
    expect(moveTrack(p, id, 99).tracks[2].id).toBe(id);
    expect(moveTrack(p, p.tracks[2].id, -5).tracks[0].id).toBe(p.tracks[2].id);
    expect(moveTrack(p, id, 0)).toBe(p);
    expect(p.tracks[0].id).toBe(id);
  });

  it('is allowed on a locked track', () => {
    const p0 = addTrack(emptyProject(), 'video');
    const p = setTrackFlags(p0, p0.tracks[0].id, { locked: true });
    expect(moveTrack(p, p.tracks[0].id, 1).tracks[1].locked).toBe(true);
  });
});

describe('renameTrack', () => {
  it('trims, caps at 40 chars and allows empty', () => {
    const p = emptyProject();
    const id = p.tracks[0].id;
    expect(renameTrack(p, id, '  Title  ').tracks[0].name).toBe('Title');
    expect(renameTrack(p, id, 'x'.repeat(60)).tracks[0].name).toHaveLength(40);
    expect(renameTrack(renameTrack(p, id, 'A'), id, '   ').tracks[0].name).toBe('');
  });

  it('works on a locked track', () => {
    const p0 = emptyProject();
    const p = setTrackFlags(p0, p0.tracks[0].id, { locked: true });
    expect(renameTrack(p, p.tracks[0].id, 'B').tracks[0].name).toBe('B');
  });
});

describe('setTrackFlags', () => {
  it('sets flags and returns p when nothing changes', () => {
    const p = emptyProject();
    const q = setTrackFlags(p, p.tracks[0].id, { muted: true, solo: true });
    expect(q.tracks[0]).toMatchObject({ muted: true, solo: true });
    expect(p.tracks[0].muted).toBe(false);
    expect(setTrackFlags(p, p.tracks[0].id, { muted: false })).toBe(p);
    expect(setTrackFlags(p, p.tracks[0].id, {})).toBe(p);
  });

  it('rejects hidden on an audio track and unknown ids', () => {
    const p = emptyProject();
    expect(() => setTrackFlags(p, p.tracks[1].id, { hidden: true })).toThrow(TimelineError);
    expect(setTrackFlags(p, p.tracks[0].id, { hidden: true }).tracks[0].hidden).toBe(true);
    expect(() => setTrackFlags(p, 'nope', { muted: true })).toThrow(TimelineError);
  });

  it('can unlock a locked track', () => {
    const p = emptyProject();
    const id = p.tracks[0].id;
    const locked = setTrackFlags(p, id, { locked: true });
    expect(isLocked(locked, id)).toBe(true);
    expect(isLocked(setTrackFlags(locked, id, { locked: false }), id)).toBe(false);
  });
});

describe('trackLabel', () => {
  it('numbers per kind in array order and prefers names', () => {
    let p: Project = emptyProject(); // v1 a1
    p = addTrack(p, 'video'); // v1 v2 a1
    p = addTrack(p, 'audio'); // v1 v2 a1 a2
    expect(p.tracks.map((t) => trackLabel(p, t.id))).toEqual(['Video 1', 'Video 2', 'Audio 1', 'Audio 2']);
    const named = renameTrack(p, p.tracks[1].id, 'Titles');
    expect(trackLabel(named, p.tracks[1].id)).toBe('Titles');
    expect(trackLabel(named, p.tracks[0].id)).toBe('Video 1');
  });

  it('throws for an unknown track', () => {
    expect(() => trackLabel(emptyProject(), 'nope')).toThrow(TimelineError);
    expect(isLocked({ ...emptyProject(), tracks: [newTrack('video')] }, 'nope')).toBe(false);
  });
});
