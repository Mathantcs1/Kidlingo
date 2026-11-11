import { describe, it, expect } from 'vitest';
import { clipDuckPoints, duckEnvelope, duckPointsFor } from '../src/audio/duck';
import { envelopeAt, windowPoints } from '../src/audio/fade';
import { planWindow, trackVolumes, windowBounds } from '../src/audio/plan';
import { DEFAULT_DUCK, patchTrackDuck } from '../src/core/duckEdits';
import { defaultClipAudio, emptyProject, newTrack } from '../src/core/model';
import type { Clip, MediaRef, Project, Track } from '../src/core/model';
import { removeTrack } from '../src/core/tracks';
import { commit, createHistory, undo } from '../src/state/history';

const OPTS = { amountDb: -12, attack: 0.2, release: 0.5 };
const DUCKED = 10 ** (-12 / 20);

const media = (id: string): MediaRef => ({ id, name: `${id}.wav`, kind: 'audio', duration: 600, hasAudio: true });

let seq = 0;
function clip(start: number, dur: number, over: Partial<Clip> = {}): Clip {
  return {
    id: `c${++seq}`,
    mediaId: 'm',
    kind: 'audio',
    start,
    in: 0,
    out: dur,
    volume: 1,
    audio: defaultClipAudio(),
    fit: 'fit',
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    ...over,
  };
}

/** Track `music` ducks under track `voice`. */
function project(voice: Clip[], voiceOver: Partial<Track> = {}, musicClips: Clip[] = [clip(0, 30)]): Project {
  const p = emptyProject();
  return {
    ...p,
    tracks: [
      { ...newTrack('video'), id: 'v' },
      { ...newTrack('audio'), id: 'voice', clips: voice, ...voiceOver },
      { ...newTrack('audio'), id: 'music', clips: musicClips, duck: { sourceTrackId: 'voice', ...OPTS } },
    ],
    media: { m: media('m') },
  };
}

const music = (p: Project): Track => p.tracks.find((t) => t.id === 'music')!;

const strictlyIncreasing = (pts: { t: number }[]): boolean => pts.every((x, i) => i === 0 || x.t > pts[i - 1].t);

describe('duckEnvelope', () => {
  it('ramps down over attack ending at the start and back up over release after the end', () => {
    const pts = duckEnvelope([[10, 14]], OPTS);
    expect(pts.map((x) => x.t)).toEqual([9.8, 10, 14, 14.5]);
    expect(pts.map((x) => Number(x.gain.toFixed(4)))).toEqual([1, 0.2512, 0.2512, 1]);
    expect(envelopeAt(pts, 5)).toBe(1);
    expect(envelopeAt(pts, 12)).toBeCloseTo(DUCKED, 12);
    expect(envelopeAt(pts, 20)).toBe(1);
  });

  it('keeps one continuous dip when a release would overlap the next attack', () => {
    const pts = duckEnvelope([[10, 14], [14.3, 16]], OPTS);
    expect(pts.map((x) => x.t)).toEqual([9.8, 10, 16, 16.5]);
    for (let t = 10; t <= 16; t += 0.05) expect(envelopeAt(pts, t)).toBeCloseTo(DUCKED, 9);
  });

  it('returns to 1 between intervals far enough apart', () => {
    const pts = duckEnvelope([[20, 22], [10, 14]], OPTS);
    expect(pts.map((x) => x.t)).toEqual([9.8, 10, 14, 14.5, 19.8, 20, 22, 22.5]);
    expect(envelopeAt(pts, 17)).toBe(1);
  });

  it('merges overlapping and adjacent intervals', () => {
    const pts = duckEnvelope([[10, 12], [11, 13], [13, 14]], OPTS);
    expect(pts.map((x) => x.t)).toEqual([9.8, 10, 14, 14.5]);
  });

  it('is empty for no intervals and ignores empty / invalid ones', () => {
    expect(duckEnvelope([], OPTS)).toEqual([]);
    expect(duckEnvelope([[5, 5], [7, 6], [NaN, 3]], OPTS)).toEqual([]);
  });

  it('keeps every gain at 1 for amount 0', () => {
    const pts = duckEnvelope([[10, 14], [20, 21]], { ...OPTS, amountDb: 0 });
    expect(pts.length).toBeGreaterThan(0);
    expect(pts.every((x) => x.gain === 1)).toBe(true);
  });

  it('keeps breakpoints strictly increasing (many random intervals)', () => {
    let s = 1;
    const rnd = (): number => ((s = (s * 16807) % 2147483647) / 2147483647);
    const iv: [number, number][] = [];
    for (let i = 0; i < 200; i++) {
      const a = rnd() * 100;
      iv.push([a, a + rnd() * 2]);
    }
    const pts = duckEnvelope(iv, OPTS);
    expect(strictlyIncreasing(pts)).toBe(true);
    // Exactly touching release/attack (gap = release + attack) is merged, so no duplicate t.
    expect(strictlyIncreasing(duckEnvelope([[0, 1], [1.7, 2]], OPTS))).toBe(true);
  });

  it('windowed slices reproduce the envelope within 1e-9 (window seams join exactly)', () => {
    const pts = duckEnvelope([[0.5, 2.3], [3.1, 3.4], [6, 9.95]], OPTS);
    for (const [a, b] of windowBounds(0, 12, 1)) {
      const w = windowPoints(pts, a, b);
      for (let k = 0; k <= 100; k++) {
        const t = a + ((b - a) * k) / 100;
        expect(Math.abs(envelopeAt(w, t) - envelopeAt(pts, t))).toBeLessThan(1e-9);
      }
    }
  });
});

describe('duckPointsFor', () => {
  it('uses the clip spans of the source track', () => {
    const p = project([clip(10, 4)]);
    const pts = duckPointsFor(p, music(p));
    expect(pts?.map((x) => x.t)).toEqual([9.8, 10, 14, 14.5]);
  });

  it('is undefined without a duck setting or without an audible source clip', () => {
    const p = project([clip(10, 4)]);
    expect(duckPointsFor(p, p.tracks[1])).toBeUndefined();
    expect(duckPointsFor(project([]), music(project([])))).toBeUndefined();
  });

  it('ignores a muted source track, and a source silenced by solo elsewhere', () => {
    const muted = project([clip(10, 4)], { muted: true });
    expect(duckPointsFor(muted, music(muted))).toBeUndefined();
    const base = project([clip(10, 4)]);
    const soloMusic: Project = { ...base, tracks: base.tracks.map((t) => (t.id === 'music' ? { ...t, solo: true } : t)) };
    expect(duckPointsFor(soloMusic, music(soloMusic))).toBeUndefined();
  });

  it('ignores silent and volume-0 source clips', () => {
    const silent = clip(2, 1, { audio: { ...defaultClipAudio(), silent: true } });
    const quiet = clip(4, 1, { volume: 0 });
    const p = project([silent, quiet, clip(10, 4)]);
    expect(duckPointsFor(p, music(p))?.map((x) => x.t)).toEqual([9.8, 10, 14, 14.5]);
  });

  it('fills Segment.duckPoints through planWindow for the ducked track only', () => {
    const v = clip(10, 4);
    const m = clip(0, 30);
    const p = project([v], {}, [m]);
    const segs = planWindow([v, m], 0, 30, trackVolumes(p), clipDuckPoints(p));
    expect(segs.find((s) => s.clipId === m.id)?.duckPoints?.map((x) => x.t)).toEqual([9.8, 10, 14, 14.5]);
    expect(segs.find((s) => s.clipId === v.id)?.duckPoints).toBeUndefined();
  });
});

describe('patchTrackDuck', () => {
  it('starts from the defaults when choosing a source, keeps the shape when changing it, and clears with null', () => {
    const p = project([clip(10, 4)]);
    const plain: Project = { ...p, tracks: p.tracks.map((t) => (t.id === 'music' ? { ...t, duck: null } : t)) };
    const on = patchTrackDuck(plain, 'music', { sourceTrackId: 'voice' });
    expect(music(on).duck).toEqual({ sourceTrackId: 'voice', ...DEFAULT_DUCK });
    const deeper = patchTrackDuck(on, 'music', { amountDb: -20 });
    expect(music(deeper).duck).toEqual({ sourceTrackId: 'voice', ...DEFAULT_DUCK, amountDb: -20 });
    expect(patchTrackDuck(deeper, 'music', { amountDb: -20 })).toBe(deeper);
    expect(music(patchTrackDuck(deeper, 'music', null)).duck).toBeNull();
  });

  it('ignores shape changes while ducking is off and refuses a cycle', () => {
    const p = project([clip(10, 4)]);
    const plain: Project = { ...p, tracks: p.tracks.map((t) => (t.id === 'music' ? { ...t, duck: null } : t)) };
    expect(patchTrackDuck(plain, 'music', { amountDb: -3 })).toBe(plain);
    expect(() => patchTrackDuck(p, 'voice', { sourceTrackId: 'music' })).toThrow(/cycle/);
  });
});

describe('removeTrack and ducking', () => {
  /** Tracks: v, voice (source), music (ducks under voice), other (ducks under v), spare (no duck). */
  function deps(): Project {
    const p = project([]);
    return {
      ...p,
      tracks: [
        ...p.tracks,
        { ...newTrack('audio'), id: 'other', duck: { sourceTrackId: 'v', ...OPTS } },
        { ...newTrack('audio'), id: 'spare' },
      ],
    };
  }

  it('clears the duck of every track ducking under the removed track, keeping the others as the same objects', () => {
    const p = deps();
    const next = removeTrack(p, 'voice');
    expect(next.tracks.map((t) => t.id)).toEqual(['v', 'music', 'other', 'spare']);
    expect(music(next).duck).toBeNull();
    const same = (id: string) => next.tracks.find((t) => t.id === id) === p.tracks.find((t) => t.id === id);
    expect(same('v') && same('other') && same('spare')).toBe(true);
  });

  it('leaves every remaining track untouched when nobody ducks under the removed track', () => {
    const p = deps();
    const next = removeTrack(p, 'spare');
    next.tracks.forEach((t, i) => expect(t).toBe(p.tracks[i]));
  });

  it('is one history step: undo restores the duck settings', () => {
    const p = deps();
    let h = createHistory(p);
    h = commit(h, removeTrack(p, 'voice'));
    h = undo(h);
    expect(music(h.present).duck).toEqual({ sourceTrackId: 'voice', ...OPTS });
    expect(h.present).toBe(p);
  });
});
