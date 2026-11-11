import { describe, it, expect } from 'vitest';
import { fadeGain, fadePoints, windowPoints } from '../src/audio/fade';
import { audibleClips, planWindow, trackVolumes } from '../src/audio/plan';
import { defaultClipAudio, emptyProject, newTrack } from '../src/core/model';
import type { Clip, ClipAudio, Project } from '../src/core/model';

let seq = 0;
function clip(start: number, duration: number, audio: Partial<ClipAudio> = {}, over: Partial<Clip> = {}): Clip {
  return {
    id: `f${++seq}`,
    mediaId: 'm',
    kind: 'audio',
    start,
    in: 10,
    out: 10 + duration,
    volume: 1,
    audio: { ...defaultClipAudio(), ...audio },
    effects: [],
    blend: 'normal',
    fit: 'fit',
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    ...over,
  };
}

describe('fadeGain', () => {
  const c = clip(2, 4, { fadeIn: 1, fadeOut: 1 });

  it('ramps 0 to 1 over the fade-in and 1 to 0 over the fade-out', () => {
    const at = [2, 2.5, 3, 5, 5.5, 6].map((t) => fadeGain(c, t));
    expect(at).toEqual([0, 0.5, 1, 1, 0.5, 0]);
    expect(fadeGain(c, 4)).toBe(1);
  });

  it('is 1 everywhere without fades', () => {
    const plain = clip(2, 4);
    for (const t of [2, 3, 5.999, 6]) expect(fadeGain(plain, t)).toBe(1);
  });

  it('stays within [0, 1] when the fades are longer than the clip', () => {
    const long = clip(0, 2, { fadeIn: 5, fadeOut: 7 });
    for (let t = -1; t <= 3; t += 0.01) {
      const g = fadeGain(long, t);
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  it('treats NaN or negative fades as no fade', () => {
    const odd = clip(0, 2, { fadeIn: Number.NaN, fadeOut: -1 });
    expect(fadeGain(odd, 0)).toBe(1);
    expect(fadeGain(odd, 2)).toBe(1);
  });
});

describe('fadePoints', () => {
  const c = clip(2, 4, { fadeIn: 1, fadeOut: 1 });

  it('includes both endpoints and the knees inside the window', () => {
    expect(fadePoints(c, 2, 6)).toEqual([
      { t: 2, gain: 0 },
      { t: 3, gain: 1 },
      { t: 5, gain: 1 },
      { t: 6, gain: 0 },
    ]);
  });

  it('a window cutting the fade-in in half ends (and the next starts) at gain 0.5', () => {
    const a = fadePoints(c, 2, 2.5);
    const b = fadePoints(c, 2.5, 6);
    expect(a).toEqual([
      { t: 2, gain: 0 },
      { t: 2.5, gain: 0.5 },
    ]);
    expect(b[0]).toEqual({ t: 2.5, gain: 0.5 });
    expect(b[b.length - 1]).toEqual({ t: 6, gain: 0 });
  });

  it('is seam-exact: at any cut the gain is the same on both sides', () => {
    const odd = clip(1.37, 7.3, { fadeIn: 2.9, fadeOut: 3.3 });
    for (let cut = 1.4; cut < 8.6; cut += 0.37) {
      const left = fadePoints(odd, 1.37, cut);
      const right = fadePoints(odd, cut, 8.67);
      const l = left[left.length - 1];
      expect(l.t).toBe(cut);
      expect(right[0].t).toBe(cut);
      expect(right[0].gain).toBe(l.gain);
      expect(l.gain).toBe(fadeGain(odd, cut));
    }
  });

  it('a window without a knee is just its two endpoints', () => {
    expect(fadePoints(c, 3.5, 4.5)).toEqual([
      { t: 3.5, gain: 1 },
      { t: 4.5, gain: 1 },
    ]);
  });

  it('follows the curved product closely where fade-in and fade-out overlap', () => {
    const over = clip(0, 2, { fadeIn: 1.5, fadeOut: 1.5 });
    const pts = fadePoints(over, 0, 2);
    for (const p of pts) expect(p.gain).toBe(fadeGain(over, p.t));
    // Linear interpolation between the points stays within 1 % of the true gain.
    for (let t = 0; t <= 2; t += 0.01) {
      const i = pts.findIndex((p) => p.t >= t);
      const a = pts[Math.max(0, i - 1)];
      const b = pts[i];
      const lerp = b.t === a.t ? b.gain : a.gain + ((b.gain - a.gain) * (t - a.t)) / (b.t - a.t);
      expect(Math.abs(lerp - fadeGain(over, t))).toBeLessThan(0.01);
    }
  });
});

describe('windowPoints', () => {
  const env = [
    { t: 1, gain: 1 },
    { t: 2, gain: 0.5 },
    { t: 4, gain: 0.5 },
    { t: 5, gain: 1 },
  ];

  it('interpolates the endpoints and keeps the points strictly inside', () => {
    expect(windowPoints(env, 1.5, 4.5)).toEqual([
      { t: 1.5, gain: 0.75 },
      { t: 2, gain: 0.5 },
      { t: 4, gain: 0.5 },
      { t: 4.5, gain: 0.75 },
    ]);
  });

  it('holds the first and last values outside the envelope', () => {
    expect(windowPoints(env, 0, 0.5)).toEqual([
      { t: 0, gain: 1 },
      { t: 0.5, gain: 1 },
    ]);
    expect(windowPoints(env, 6, 7)).toEqual([
      { t: 6, gain: 1 },
      { t: 7, gain: 1 },
    ]);
  });

  it('an empty envelope is unity gain', () => {
    expect(windowPoints([], 0, 1)).toEqual([
      { t: 0, gain: 1 },
      { t: 1, gain: 1 },
    ]);
  });
});

describe('audibleClips with clip audio and track volume', () => {
  function proj(clips: Clip[], trackVolume = 1, other: Clip[] = []): Project {
    const p = emptyProject();
    return {
      ...p,
      tracks: [
        { ...newTrack('audio'), id: 'a', clips, volume: trackVolume },
        { ...newTrack('audio'), id: 'b', clips: other },
      ],
      media: { m: { id: 'm', name: 'm.wav', kind: 'audio', duration: 100, width: 0, height: 0, hasAudio: true } },
    };
  }

  it('omits clips marked silent', () => {
    const loud = clip(0, 2);
    const quiet = clip(2, 2, { silent: true });
    expect(audibleClips(proj([loud, quiet])).map((c) => c.id)).toEqual([loud.id]);
  });

  it('omits clips on a track with volume 0 (or NaN)', () => {
    const a = clip(0, 2);
    const b = clip(0, 2);
    expect(audibleClips(proj([a], 0, [b])).map((c) => c.id)).toEqual([b.id]);
    expect(audibleClips(proj([a], Number.NaN, [b])).map((c) => c.id)).toEqual([b.id]);
  });

  it('segments carry their clip and their track volume', () => {
    const a = clip(0, 2, {}, { volume: 0.8 });
    const b = clip(1, 2);
    const p = proj([a], 0.5, [b]);
    const segs = planWindow(audibleClips(p), 0, 30, trackVolumes(p));
    expect(segs.map((s) => [s.clip, s.trackVolume])).toEqual([
      [a, 0.5],
      [b, 1],
    ]);
  });
});
