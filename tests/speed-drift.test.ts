// Plan 5D Task 12: long-clip guards: a 60 s retimed clip split at whole frames keeps every output frame on the same footage
// time (no drift), and a speed ramp costs little autosave space per key.
import { describe, it, expect } from 'vitest';
import { clipDuration, sourceAtOffset } from '../src/core/clipTime';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { splitClip } from '../src/core/timeline';

const FPS = 30;
const lin = { kind: 'linear' as const };
const mk = (extra: Partial<Clip>): Clip => ({
  id: 'a', mediaId: 'm1', kind: 'video', start: 0, in: 0, out: 60, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const proj = (c: Clip): Project => {
  const p = emptyProject('youtube');
  p.format = { ...p.format, fps: FPS };
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 120, width: 1920, height: 1080, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', clips: [c] };
  return p;
};

describe('60 s drift', () => {
  const variants: [string, Partial<Clip>][] = [
    ['1.5x', { speed: 1.5 }],
    ['reverse 0.75x', { reverse: true, speed: 0.75 }],
    ['ramp', { speedKeys: [{ t: 0, v: 1, ease: lin }, { t: 30, v: 3, ease: lin }, { t: 60, v: 0.5, ease: lin }] }],
  ];
  for (const [name, extra] of variants) {
    it(`${name}: 19 whole-frame cuts leave every output frame on its footage time (< 1e-6 s)`, () => {
      const whole = mk(extra);
      let p = proj(whole);
      const total = Math.floor(clipDuration(whole) * FPS);
      const cuts = Array.from({ length: 19 }, (_, i) => Math.floor(((i + 1) * total) / 20));
      // Cut right to left so earlier cuts keep their positions.
      for (const f of [...cuts].reverse()) {
        const target = [...p.tracks[0].clips].sort((a, b) => a.start - b.start).find((c) => c.start <= f / FPS && f / FPS < c.start + clipDuration(c))!;
        p = splitClip(p, target.id, f / FPS);
      }
      const pieces = [...p.tracks[0].clips].sort((a, b) => a.start - b.start);
      expect(pieces).toHaveLength(20);
      let worst = 0;
      for (let n = 0; n < total; n += 7) {
        const t = n / FPS;
        const piece = pieces.find((c) => c.start <= t + 1e-9 && t < c.start + clipDuration(c))!;
        worst = Math.max(worst, Math.abs(sourceAtOffset(piece, t - piece.start) - sourceAtOffset(whole, t)));
      }
      expect(worst).toBeLessThan(1e-6);
    });
  }
});

describe('autosave size', () => {
  it('a ramp key adds under 200 bytes to the saved project', () => {
    const base = JSON.stringify(proj(mk({}))).length;
    const keys = Array.from({ length: 64 }, (_, i) => ({ t: i, v: 1 + (i % 3), ease: lin }));
    const withRamp = JSON.stringify(proj(mk({ speedKeys: keys }))).length;
    expect((withRamp - base) / 64).toBeLessThan(200);
  });
});
