import { describe, it, expect } from 'vitest';
import { emptyProject, defaultTransform, clipEnd } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { joinClips, snapTime, fitTransform, reframeProject } from '../src/core/merge';

const mk = (id: string, start: number, dur: number, over: Partial<Clip> = {}): Clip => ({
  id,
  mediaId: 'm1',
  kind: 'video',
  start,
  in: 0,
  out: dur,
  transform: defaultTransform(),
  volume: 1,
  fit: 'fit',
  ...over,
});

function withClips(videoClips: Clip[], audioClips: Clip[] = []): Project {
  const p = emptyProject();
  return {
    ...p,
    tracks: p.tracks.map((t) => ({ ...t, clips: t.kind === 'video' ? videoClips : audioClips })),
  };
}

const clipsOf = (p: Project, i = 0): Clip[] => p.tracks[i].clips;
const byId = (p: Project, id: string): Clip => {
  for (const t of p.tracks) for (const c of t.clips) if (c.id === id) return c;
  throw new Error('missing ' + id);
};

describe('joinClips', () => {
  const base = () => withClips([mk('A', 0, 3), mk('B', 10, 4), mk('C', 20, 2)]);

  it('places clips back-to-back from the minimum start', () => {
    const r = joinClips(base(), ['A', 'B', 'C']);
    expect(['A', 'B', 'C'].map((id) => byId(r, id).start)).toEqual([0, 3, 7]);
    expect(['A', 'B', 'C'].map((id) => clipEnd(byId(r, id)))).toEqual([3, 7, 9]);
  });

  it('respects the given order', () => {
    const r = joinClips(base(), ['C', 'A']);
    expect(byId(r, 'C').start).toBe(0);
    expect(byId(r, 'A').start).toBe(2);
    expect(clipEnd(byId(r, 'A'))).toBe(5);
  });

  it('keeps the track sorted by start', () => {
    const r = joinClips(base(), ['C', 'A']);
    const starts = clipsOf(r).map((c) => c.start);
    expect(starts).toEqual([...starts].sort((a, b) => a - b));
  });

  it('shifts non-selected clips after the set by the same delta', () => {
    const p = withClips([mk('A', 0, 3), mk('B', 10, 4), mk('D', 20, 5)]);
    const r = joinClips(p, ['A', 'B']);
    expect(byId(r, 'B').start).toBe(3);
    // original end 14, run end 7, delta -7: D 20 -> 13
    expect(byId(r, 'D').start).toBe(13);
  });

  it('leaves non-selected clips before the run untouched', () => {
    const p = withClips([mk('Z', 0, 1), mk('A', 2, 3), mk('B', 10, 4)]);
    const r = joinClips(p, ['A', 'B']);
    expect(byId(r, 'Z').start).toBe(0);
    expect(byId(r, 'A').start).toBe(2);
    expect(byId(r, 'B').start).toBe(5);
  });

  it('throws when a non-selected clip would overlap the run', () => {
    const p = withClips([mk('A', 0, 3), mk('X', 4, 1), mk('B', 10, 4)]);
    expect(() => joinClips(p, ['A', 'B'])).toThrow(TimelineError);
  });

  it('throws for fewer than 2 ids', () => {
    expect(() => joinClips(base(), ['A'])).toThrow(TimelineError);
    expect(() => joinClips(base(), [])).toThrow(TimelineError);
  });

  it('throws for unknown ids', () => {
    expect(() => joinClips(base(), ['A', 'nope'])).toThrow(TimelineError);
  });

  it('throws for clips on different tracks', () => {
    const p = withClips([mk('A', 0, 3)], [mk('B', 0, 3, { kind: 'audio' })]);
    expect(() => joinClips(p, ['A', 'B'])).toThrow(TimelineError);
  });

  it('does not mutate the input', () => {
    const p = base();
    const snap = JSON.parse(JSON.stringify(p));
    joinClips(p, ['A', 'B', 'C']);
    expect(p).toEqual(snap);
  });
});

describe('snapTime', () => {
  const p = withClips([mk('A', 1, 4)], [mk('B', 6, 2, { kind: 'audio' })]);
  const tid = p.tracks[0].id;

  it('snaps to a clip end within threshold', () => {
    expect(snapTime(p, tid, 4.95, 0.1)).toBe(5);
  });
  it('returns time when nothing is near', () => {
    expect(snapTime(p, tid, 4.5, 0.1)).toBe(4.5);
  });
  it('snaps to 0', () => {
    expect(snapTime(p, tid, 0.05, 0.1)).toBe(0);
  });
  it('snaps to clips on other tracks', () => {
    expect(snapTime(p, tid, 6.03, 0.1)).toBe(6);
    expect(snapTime(p, tid, 7.95, 0.1)).toBe(8);
  });
  it('picks the nearest candidate', () => {
    const q = withClips([mk('A', 0, 5), mk('B', 5.08, 2)]);
    expect(snapTime(q, q.tracks[0].id, 5.06, 0.1)).toBe(5.08);
  });
});

describe('fitTransform', () => {
  const src = { width: 1920, height: 1080 };
  const canvas = { width: 1080, height: 1920 };

  it('fit shows the whole source, centered', () => {
    const t = fitTransform(src, canvas, 'fit');
    expect(t).toEqual({ x: 0, y: 0, scale: 1080 / 1920, rotation: 0, opacity: 1 });
  });
  it('fill covers the canvas', () => {
    const t = fitTransform(src, canvas, 'fill');
    expect(t.scale).toBeCloseTo(1920 / 1080, 10);
    expect(t.x).toBe(0);
    expect(t.y).toBe(0);
  });
  it('blur uses the fit scale', () => {
    expect(fitTransform(src, canvas, 'blur')).toEqual(fitTransform(src, canvas, 'fit'));
  });
});

describe('reframeProject', () => {
  const media = {
    v: { id: 'v', name: 'v', kind: 'video' as const, duration: 10, width: 1920, height: 1080, hasAudio: true },
    a: { id: 'a', name: 'a', kind: 'audio' as const, duration: 10, hasAudio: true },
    nodim: { id: 'nodim', name: 'n', kind: 'video' as const, duration: 10, hasAudio: false },
  };
  const build = (): Project => {
    const p = withClips(
      [
        mk('V1', 0, 3, { mediaId: 'v' }),
        mk('V2', 3, 3, { mediaId: 'v', fit: 'fill' }),
        mk('ND', 6, 2, { mediaId: 'nodim' }),
      ],
      [mk('AU', 0, 3, { mediaId: 'a', kind: 'audio' })],
    );
    return { ...p, media };
  };

  it('updates format size and keeps fps', () => {
    const p = build();
    const r = reframeProject(p, 'vertical');
    expect(r.format).toEqual({ width: 1080, height: 1920, fps: p.format.fps });
  });
  it('recomputes video clip scale honoring each clip fit mode', () => {
    const r = reframeProject(build(), 'vertical');
    expect(byId(r, 'V1').transform.scale).toBeCloseTo(0.5625, 10);
    expect(byId(r, 'V2').transform.scale).toBeCloseTo(1920 / 1080, 10);
    expect(byId(r, 'V1').fit).toBe('fit');
    expect(byId(r, 'V2').fit).toBe('fill');
  });
  it('skips audio clips and media without dimensions', () => {
    const p = build();
    const r = reframeProject(p, 'vertical');
    expect(byId(r, 'AU').transform).toEqual(byId(p, 'AU').transform);
    expect(byId(r, 'ND').transform).toEqual(byId(p, 'ND').transform);
  });
  it('does not mutate the input', () => {
    const p = build();
    const snap = JSON.parse(JSON.stringify(p));
    reframeProject(p, 'square');
    expect(p).toEqual(snap);
  });
});
