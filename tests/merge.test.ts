import { describe, it, expect } from 'vitest';
import { emptyProject, defaultTransform, clipEnd } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { joinClips, snapTime, fitTransform, reframeProject } from '../src/core/merge';
import type { FormatKey } from '../src/core/formats';

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

describe('reframeProject keeps customised placement (Ruling G)', () => {
  const v = { id: 'v', name: 'v', kind: 'video' as const, duration: 10, width: 1920, height: 1080, hasAudio: true };
  const sq = { id: 'sq', name: 'sq', kind: 'image' as const, duration: 5, width: 200, height: 200, hasAudio: false };
  const a = { id: 'a', name: 'a', kind: 'audio' as const, duration: 10, hasAudio: true };
  const nodim = { id: 'nodim', name: 'n', kind: 'video' as const, duration: 10, hasAudio: false };
  const fit = (m: { width: number; height: number }, w: number, h: number, mode: Clip['fit'] = 'fit') =>
    fitTransform(m, { width: w, height: h }, mode);
  const pipT = { x: 300, y: -200, scale: 0.25, rotation: 30, opacity: 0.5 };

  /** Three video layers (background fit, PiP, customised blur) + audio, in a 1920×1080 project. */
  const build = (): Project => {
    const p = emptyProject('youtube');
    return {
      ...p,
      media: { v, sq, a, nodim },
      tracks: [
        { ...p.tracks[0], id: 'L1', clips: [mk('BG', 0, 5, { mediaId: 'v', transform: fit(v, 1920, 1080) }), mk('ND', 5, 2, { mediaId: 'nodim', transform: { ...pipT } })] },
        { ...p.tracks[0], id: 'L2', locked: true, clips: [mk('PIP', 0, 5, { mediaId: 'v', transform: { ...pipT } })] },
        { ...p.tracks[0], id: 'L3', clips: [mk('BL', 0, 5, { mediaId: 'sq', fit: 'blur', transform: { x: -100, y: 50, scale: 2, rotation: 0, opacity: 1 } }), mk('FILL', 5, 2, { mediaId: 'sq', fit: 'fill', transform: fit(sq, 1920, 1080, 'fill') })] },
        { ...p.tracks[1], id: 'A1', clips: [mk('AU', 0, 3, { mediaId: 'a', kind: 'audio', transform: { ...pipT } })] },
      ],
    };
  };

  it('refits untouched clips exactly as before (fit and fill)', () => {
    const r = reframeProject(build(), 'vertical');
    expect(byId(r, 'BG').transform).toEqual(fit(v, 1080, 1920));
    expect(byId(r, 'FILL').transform).toEqual(fit(sq, 1080, 1920, 'fill'));
  });

  it('keeps a customised PiP clip in proportion: x·w′/w, y·h′/h, scale·√(area ratio); rotation/opacity kept', () => {
    const r = reframeProject(build(), 'vertical');
    const t = byId(r, 'PIP').transform;
    expect(t.x).toBeCloseTo(300 * (1080 / 1920), 9);
    expect(t.y).toBeCloseTo(-200 * (1920 / 1080), 9);
    // Ruling J: 16:9 → 9:16 keeps the area, so the scale stays.
    expect(t.scale).toBeCloseTo(0.25, 9);
    expect(t.rotation).toBe(30);
    expect(t.opacity).toBe(0.5);
  });

  it('treats a customised blur clip the same way and keeps its fit mode', () => {
    const r = reframeProject(build(), 'square');
    const bl = byId(r, 'BL').transform;
    expect(bl).toMatchObject({ y: 50, rotation: 0, opacity: 1 });
    expect(bl.x).toBeCloseTo(-100 * (1080 / 1920), 9);
    expect(bl.scale).toBeCloseTo(2 * Math.sqrt(1080 / 1920), 9);
    expect(byId(r, 'BL').fit).toBe('blur');
  });

  it('reframes every layer, locked ones included; leaves audio clips and media without size alone', () => {
    const p = build();
    const r = reframeProject(p, 'vertical');
    expect(byId(r, 'PIP').transform).not.toEqual(byId(p, 'PIP').transform);
    expect(byId(r, 'AU').transform).toEqual(pipT);
    expect(byId(r, 'ND').transform).toEqual(pipT);
    expect(r.tracks.map((t) => [t.id, t.locked])).toEqual(p.tracks.map((t) => [t.id, t.locked]));
  });

  it('a transform within 1e-6 of the old fit counts as untouched', () => {
    const p = build();
    const near = { ...fit(v, 1920, 1080), x: 5e-7, scale: 1 + 5e-7 };
    const q = { ...p, tracks: p.tracks.map((t) => (t.id === 'L1' ? { ...t, clips: [{ ...t.clips[0], transform: near }] } : t)) };
    expect(byId(reframeProject(q, 'vertical'), 'BG').transform).toEqual(fit(v, 1080, 1920));
  });

  it('Ruling K: the scale is never clamped in a format switch (only guarded to stay finite and > 0)', () => {
    const p = build();
    const withScale = (q: Project, s: number): Project => ({ ...q, tracks: q.tracks.map((t) => (t.id === 'L2' ? { ...t, clips: [{ ...t.clips[0], transform: { ...pipT, scale: s } }] } : t)) });
    // 16:9 → 1:1 scales by √(1080/1920): a 0.02 clip goes below the 0.02 floor.
    expect(byId(reframeProject(withScale(p, 0.02), 'square'), 'PIP').transform.scale).toBeCloseTo(0.02 * Math.sqrt(1080 / 1920), 12);
    // A custom 960×540 canvas to 1920×1080 doubles the scale: 15× → 30× (above the 20× cap), 30× → 60×.
    const custom = (s: number): Project => ({ ...withScale(p, s), format: { ...p.format, width: 960, height: 540 } });
    expect(byId(reframeProject(custom(15), 'youtube'), 'PIP').transform.scale).toBeCloseTo(30, 9);
    expect(byId(reframeProject(custom(30), 'youtube'), 'PIP').transform.scale).toBeCloseTo(60, 9);
    expect(byId(reframeProject(custom(3), 'youtube'), 'PIP').transform.scale).toBeCloseTo(6, 9);
  });

  it('Ruling K guard: a non-finite or non-positive scale stays as it was instead of becoming NaN/0', () => {
    const p = build();
    for (const bad of [NaN, Infinity, 0, -2]) {
      const q = { ...p, tracks: p.tracks.map((t) => (t.id === 'L2' ? { ...t, clips: [{ ...t.clips[0], transform: { ...pipT, scale: bad } }] } : t)) };
      const s = byId(reframeProject(q, 'square'), 'PIP').transform.scale;
      expect(Object.is(s, bad)).toBe(true);
    }
  });

  it('Ruling I: untouched means x, y and scale at the old fit; a faded full-frame fill clip refits and stays faded', () => {
    const p = build();
    const faded = { ...p, tracks: p.tracks.map((t) => (t.id === 'L3' ? { ...t, clips: [t.clips[0], { ...t.clips[1], transform: { ...fit(sq, 1920, 1080, 'fill'), opacity: 0.5 } }] } : t)) };
    expect(byId(reframeProject(faded, 'vertical'), 'FILL').transform).toEqual({ ...fit(sq, 1080, 1920, 'fill'), opacity: 0.5 });
  });

  it('Ruling I: a rotated clip still at its fit position and scale refits and keeps its rotation', () => {
    const p = build();
    // (A 'fill' clip: its refit scale differs from any proportional rescale, so the test can tell.)
    const rotated = { ...p, tracks: p.tracks.map((t) => (t.id === 'L3' ? { ...t, clips: [t.clips[0], { ...t.clips[1], transform: { ...fit(sq, 1920, 1080, 'fill'), rotation: 10 } }] } : t)) };
    expect(byId(reframeProject(rotated, 'vertical'), 'FILL').transform).toEqual({ ...fit(sq, 1080, 1920, 'fill'), rotation: 10 });
  });

  it('a non-positive or non-finite old canvas refits every visual clip to the new format (no division)', () => {
    for (const bad of [{ width: 0, height: 1080 }, { width: 1920, height: -1 }, { width: NaN, height: 1080 }, { width: Infinity, height: 1080 }]) {
      const p = build();
      const r = reframeProject({ ...p, format: { ...p.format, ...bad } }, 'vertical');
      expect(r.format).toMatchObject({ width: 1080, height: 1920 });
      expect(byId(r, 'BG').transform).toEqual(fit(v, 1080, 1920));
      expect(byId(r, 'PIP').transform).toEqual({ ...fit(v, 1080, 1920), rotation: 30, opacity: 0.5 });
      for (const c of r.tracks.flatMap((t) => t.clips)) for (const x of Object.values(c.transform)) expect(Number.isFinite(x)).toBe(true);
    }
  });

  it('returns the same project when the format does not change', () => {
    const p = build();
    expect(reframeProject(p, 'youtube')).toBe(p);
  });

  describe('Ruling J: a round trip A → B → A restores every clip exactly', () => {
    const custom = { x: 300, y: -200, scale: 3, rotation: 10, opacity: 0.5 };
    const keys: FormatKey[] = ['youtube', 'vertical', 'square', 'portrait'];
    const pairs = keys.flatMap((a) => keys.filter((b) => b !== a).map((b) => [a, b] as const));
    /** build() in format `a` (untouched clips refit there) with the PiP placed at `custom` (scale overridable). */
    const start = (a: FormatKey, scale = custom.scale): Project => {
      const q = a === 'youtube' ? build() : reframeProject(build(), a);
      return { ...q, tracks: q.tracks.map((t) => (t.id === 'L2' ? { ...t, clips: [{ ...t.clips[0], transform: { ...custom, scale } }] } : t)) };
    };
    const close = (a: Clip['transform'], b: Clip['transform']) => {
      for (const k of ['x', 'y', 'scale', 'rotation', 'opacity'] as const) expect(Math.abs(a[k] - b[k]), k).toBeLessThanOrEqual(1e-9);
    };

    it.each(pairs)('%s → %s → back', (a, b) => {
      const p = start(a);
      const back = reframeProject(reframeProject(p, b), a);
      expect(back.format).toEqual(p.format);
      for (const id of ['PIP', 'BL', 'BG', 'FILL']) close(byId(back, id).transform, byId(p, id).transform);
    });

    it('YouTube → Vertical → YouTube twice keeps a placed clip at scale 3', () => {
      let p = start('youtube');
      for (let i = 0; i < 2; i++) p = reframeProject(reframeProject(p, 'vertical'), 'youtube');
      close(byId(p, 'PIP').transform, custom);
    });

    it('Ruling K: clips above 20× (and below 0.02) round-trip exactly too', () => {
      for (const s of [30, 67.5, 0.01]) {
        const p = start('youtube', s);
        const sq = reframeProject(p, 'square');
        expect(byId(sq, 'PIP').transform.scale).toBeCloseTo(s * Math.sqrt(1080 / 1920), 9);
        close(byId(reframeProject(sq, 'youtube'), 'PIP').transform, { ...custom, scale: s });
      }
    });
  });

  it('does not mutate the input', () => {
    const p = build();
    const snap = JSON.parse(JSON.stringify(p));
    reframeProject(p, 'vertical');
    expect(p).toEqual(snap);
  });
});
