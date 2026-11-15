// Plan 5D Task 8: planWindow plans a retimed clip as a virtual speed-1 source over [0, D]; plain clips are unchanged.
import { describe, it, expect } from 'vitest';
import { clipDuration } from '../src/core/clipTime';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { audibleClips, planWindow, trackVolumes } from '../src/audio/plan';

const mk = (id: string, extra: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm1', kind: 'audio', start: 2, in: 1, out: 9, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const proj = (clips: Clip[], hasAudio = true): Project => {
  const p = emptyProject('youtube');
  p.media.m1 = { id: 'm1', name: 'a.wav', kind: 'audio', duration: 30, hasAudio } as never;
  p.tracks[0] = { ...p.tracks[0], id: 'a', kind: 'audio', clips };
  return p;
};
const plan = (p: Project, from: number, to: number) => planWindow(audibleClips(p), from, to, trackVolumes(p));

describe('planWindow with retimed clips', () => {
  it('a 2x clip: the whole clip plans [0, D] exactly, windows cut in clip-local timeline seconds', () => {
    const c = mk('a', { speed: 2 }); // 8 s of footage -> 4 s at 2..6
    const p = proj([c]);
    const [whole] = plan(p, 0, 100);
    expect([whole.srcFrom, whole.srcTo, whole.when, whole.whenEnd]).toEqual([0, clipDuration(c), 2, 6]);
    const [first] = plan(p, 0, 3.5);
    const [second] = plan(p, 3.5, 100);
    expect([first.srcFrom, first.srcTo]).toEqual([0, 1.5]);
    expect(second.srcFrom).toBe(first.srcTo); // bit for bit
    expect(second.srcTo).toBe(clipDuration(c));
  });
  it('a reversed clip also plans virtual time (not footage)', () => {
    const [s] = plan(proj([mk('a', { reverse: true })]), 0, 100);
    expect([s.srcFrom, s.srcTo]).toEqual([0, 8]);
  });
  it('plain clips keep footage source times (in, out) as before', () => {
    const [s] = plan(proj([mk('a')]), 0, 100);
    expect([s.srcFrom, s.srcTo]).toEqual([1, 9]);
    const [mid] = plan(proj([mk('a')]), 4, 100);
    expect(mid.srcFrom).toBe(3); // in + (4 - start)
  });
  it('a freeze clip is silent (nothing planned); a speed-1 reverse-free video clip is unchanged', () => {
    const f = mk('f', { kind: 'video', freeze: { at: 1 }, in: 0, out: 2, audio: { ...defaultClipAudio(), silent: true } });
    expect(plan(proj([f]), 0, 100)).toHaveLength(0);
  });
});
