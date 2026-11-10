import { describe, it, expect } from 'vitest';
import { audibleClips, planWindow, trackAudible, windowBounds } from '../src/audio/plan';
import type { Segment } from '../src/audio/plan';
import { emptyProject, newTrack } from '../src/core/model';
import type { Clip, MediaRef, Project, Track } from '../src/core/model';

const media = (id: string, over: Partial<MediaRef> = {}): MediaRef => ({
  id,
  name: `${id}.mp4`,
  kind: 'video',
  duration: 600,
  width: 640,
  height: 360,
  hasAudio: true,
  ...over,
});

let seq = 0;
function clip(mediaId: string, start: number, inPoint: number, out: number, over: Partial<Clip> = {}): Clip {
  return {
    id: `c${++seq}`,
    mediaId,
    kind: 'video',
    start,
    in: inPoint,
    out,
    volume: 1,
    fit: 'fit',
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    ...over,
  };
}

function projectOf(videoClips: Clip[], audio: Clip[] = [], extra: MediaRef[] = []): Project {
  const p = emptyProject();
  const ids = new Set([...videoClips, ...audio].map((c) => c.mediaId));
  const list = [...[...ids].map((id) => media(id)), ...extra];
  return {
    ...p,
    tracks: [
      { ...newTrack('video'), id: 'v', clips: videoClips },
      { ...newTrack('audio'), id: 'a', clips: audio },
    ],
    media: Object.fromEntries(list.map((m) => [m.id, m])),
  };
}

describe('audibleClips', () => {
  it('skips silent, muted, missing, unknown and image clips', () => {
    const loud = clip('m1', 0, 0, 2);
    const muted = clip('m1', 2, 0, 2, { volume: 0 });
    const lost = clip('m2', 4, 0, 2);
    const silentVideo = clip('m3', 6, 0, 2);
    const image = clip('m4', 8, 0, 2, { kind: 'image' });
    const unknown = clip('nope', 10, 0, 2);
    const music = clip('m5', 0, 0, 3, { kind: 'audio' });
    const p = projectOf([loud, muted, lost, silentVideo, image, unknown], [music]);
    p.media.m2 = { ...p.media.m2, missing: true };
    p.media.m3 = { ...p.media.m3, hasAudio: false };
    p.media.m4 = { ...p.media.m4, kind: 'image' };
    delete p.media.nope;
    expect(audibleClips(p).map((c) => c.id)).toEqual([loud.id, music.id]);
  });

  it('skips clips with a NaN volume or no duration', () => {
    const p = projectOf([clip('m1', 0, 0, 2, { volume: Number.NaN }), clip('m1', 3, 1, 1)]);
    expect(audibleClips(p)).toEqual([]);
  });
});

describe('mute and solo', () => {
  /** Video track 'v' (clip with embedded audio), audio tracks 'a1' and 'a2' (one clip each). */
  function mixProject(flags: Partial<Record<'v' | 'a1' | 'a2', Partial<Track>>> = {}) {
    const video = clip('m1', 0, 0, 2);
    const one = clip('m2', 0, 0, 2, { kind: 'audio' });
    const two = clip('m3', 0, 0, 2, { kind: 'audio' });
    const base = projectOf([video], [one], [media('m3')]);
    const p: Project = {
      ...base,
      tracks: [
        { ...base.tracks[0], ...flags.v },
        { ...base.tracks[1], id: 'a1', ...flags.a1 },
        { ...newTrack('audio'), id: 'a2', clips: [two], ...flags.a2 },
      ],
    };
    return { p, ids: { v: video.id, a1: one.id, a2: two.id } };
  }
  const ids = (p: Project): string[] => audibleClips(p).map((c) => c.id);

  it('without mute or solo every track is audible (unchanged behaviour)', () => {
    const { p, ids: i } = mixProject();
    expect(ids(p)).toEqual([i.v, i.a1, i.a2]);
    for (const t of p.tracks) expect(trackAudible(p, t)).toBe(true);
  });

  it('a muted track is silent, whatever its kind', () => {
    const { p, ids: i } = mixProject({ a1: { muted: true } });
    expect(ids(p)).toEqual([i.v, i.a2]);
    const { p: q, ids: j } = mixProject({ v: { muted: true } });
    expect(ids(q)).toEqual([j.a1, j.a2]);
  });

  it('solo on one audio track silences every other track, video-track audio included', () => {
    const { p, ids: i } = mixProject({ a2: { solo: true } });
    expect(ids(p)).toEqual([i.a2]);
    expect(trackAudible(p, p.tracks[0])).toBe(false);
  });

  it('a soloed video track keeps its embedded audio and silences the others', () => {
    const { p, ids: i } = mixProject({ v: { solo: true } });
    expect(ids(p)).toEqual([i.v]);
    const { p: q, ids: j } = mixProject({ v: { solo: true }, a1: { solo: true } });
    expect(ids(q)).toEqual([j.v, j.a1]);
  });

  it('mute wins over solo', () => {
    const { p } = mixProject({ a1: { solo: true, muted: true } });
    expect(ids(p)).toEqual([]);
    expect(trackAudible(p, p.tracks[1])).toBe(false);
  });

  it('hidden does not affect audio', () => {
    const { p, ids: i } = mixProject({ v: { hidden: true } });
    expect(ids(p)).toEqual([i.v, i.a1, i.a2]);
  });
});

describe('windowBounds', () => {
  it('splits [from, end) into windows of the given length, the last one short', () => {
    expect(windowBounds(0, 70, 30)).toEqual([
      [0, 30],
      [30, 60],
      [60, 70],
    ]);
    expect(windowBounds(5, 20, 30)).toEqual([[5, 20]]);
    expect(windowBounds(10, 10, 30)).toEqual([]);
  });

  it('computes every boundary from the origin so windows never drift', () => {
    const w = windowBounds(0.1, 100, 0.1);
    for (let i = 1; i < w.length; i++) expect(w[i][0]).toBe(w[i - 1][1]);
    expect(w[w.length - 1][1]).toBe(100);
    expect(w[37][0]).toBe(0.1 + 37 * 0.1);
  });

  it('rejects a non-positive window', () => {
    expect(() => windowBounds(0, 10, 0)).toThrow();
  });
});

describe('planWindow', () => {
  it('returns whole clips that fit inside the window with their exact source range', () => {
    const c = clip('m1', 2, 1.5, 3.5, { volume: 0.5 });
    expect(planWindow([c], 0, 30)).toEqual<Segment[]>([
      { clipId: c.id, mediaId: 'm1', srcFrom: 1.5, srcTo: 3.5, when: 2, volume: 0.5 },
    ]);
  });

  it('cuts a clip straddling the window boundary at the boundary', () => {
    const c = clip('m1', 25, 10, 20);
    const [a] = planWindow([c], 0, 30);
    const [b] = planWindow([c], 30, 60);
    expect(a).toMatchObject({ srcFrom: 10, srcTo: 15, when: 25 });
    expect(b).toMatchObject({ srcFrom: 15, srcTo: 20, when: 30 });
  });

  it('starts inside a clip when the window starts inside it (play from the middle)', () => {
    const c = clip('m1', 1, 4, 10);
    expect(planWindow([c], 3.25, 23.25)).toEqual([
      { clipId: c.id, mediaId: 'm1', srcFrom: 6.25, srcTo: 10, when: 3.25, volume: 1 },
    ]);
  });

  it('ignores clips outside the window, touching edges included', () => {
    const before = clip('m1', 0, 0, 5);
    const after = clip('m1', 30, 0, 5);
    const inside = clip('m1', 12, 0, 1);
    expect(planWindow([before, after, inside], 5, 30).map((s) => s.clipId)).toEqual([inside.id]);
  });

  it('keeps gaps: a window with no clip under it is empty', () => {
    const c = clip('m1', 40, 0, 5);
    expect(planWindow([c], 0, 30)).toEqual([]);
    expect(planWindow([c], 30, 60)).toHaveLength(1);
  });

  it('plans several short clips and overlapping tracks in one window', () => {
    const a = clip('m1', 0, 0, 0.5);
    const b = clip('m1', 0.5, 0, 0.5);
    const music = clip('m2', 0.25, 0, 0.5, { kind: 'audio' });
    const segs = planWindow([a, b, music], 0, 30);
    expect(segs.map((s) => [s.when, s.srcFrom, s.srcTo])).toEqual([
      [0, 0, 0.5],
      [0.5, 0, 0.5],
      [0.25, 0, 0.5],
    ]);
  });

  it('is sample-continuous: consecutive windows of a long clip share their exact source boundary', () => {
    const c = clip('m1', 0.37, 3.1, 603.1);
    const segs: Segment[] = [];
    for (const [a, b] of windowBounds(1.3, 600.37, 25)) segs.push(...planWindow([c], a, b));
    expect(segs.length).toBe(24);
    expect(segs[0].srcFrom).toBeCloseTo(3.1 + 1.3 - 0.37, 12);
    expect(segs[segs.length - 1].srcTo).toBe(603.1);
    for (let i = 1; i < segs.length; i++) {
      // Bit-exact: no gap, no overlap, no per-window rounding.
      expect(segs[i].srcFrom).toBe(segs[i - 1].srcTo);
      expect(segs[i].when).toBeCloseTo(segs[i - 1].when + (segs[i - 1].srcTo - segs[i - 1].srcFrom), 9);
    }
  });

  it('never yields empty or inverted segments', () => {
    const c = clip('m1', 10, 0, 5);
    expect(planWindow([c], 15, 20)).toEqual([]);
    expect(planWindow([c], 9, 9)).toEqual([]);
  });
});
