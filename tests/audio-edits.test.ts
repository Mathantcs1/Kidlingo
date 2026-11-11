import { describe, it, expect } from 'vitest';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { TimelineError, splitClip, trimClip, addClip } from '../src/core/timeline';
import { joinClips } from '../src/core/merge';
import { addTrack, removeTrack, setTrackFlags } from '../src/core/tracks';
import {
  addEffect, attachAudio, detachAudio, moveEffect, removeEffect, setClipAudio, setTrackDuck, setTrackVolume, updateEffect,
} from '../src/core/audioEdits';

const clip = (id: string, over: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm1', kind: 'video', start: 0, in: 0, out: 2, transform: defaultTransform(), volume: 1,
  audio: defaultClipAudio(), effects: [], blend: 'normal', fit: 'fit', ...over,
});

function base(hasAudio = true): Project {
  const p = emptyProject();
  return {
    ...p,
    media: { m1: { id: 'm1', name: 'a.mp4', kind: 'video', duration: 10, width: 1920, height: 1080, fps: 30, hasAudio } },
    tracks: p.tracks.map((t) => (t.kind === 'video' ? { ...t, clips: [clip('v1', { volume: 0.7 })] } : t)),
  };
}
const frozen = (p: Project): string => JSON.stringify(p);
const vTrack = (p: Project) => p.tracks.find((t) => t.kind === 'video')!;
const aTracks = (p: Project) => p.tracks.filter((t) => t.kind === 'audio');
const get = (p: Project, id: string): Clip => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)!;

describe('setClipAudio', () => {
  it('clamps fades to the clip duration, shrinking the other fade', () => {
    const p = base();
    const a = setClipAudio(p, 'v1', { fadeIn: 3 });
    expect(get(a, 'v1').audio.fadeIn).toBe(2);
    const b = setClipAudio(a, 'v1', { fadeOut: 1 });
    expect(get(b, 'v1').audio.fadeOut).toBe(1);
    expect(get(b, 'v1').audio.fadeIn).toBe(1);
  });
  it('clamps pan and negative fades', () => {
    const p = setClipAudio(base(), 'v1', { pan: 5, fadeIn: -1 });
    expect(get(p, 'v1').audio.pan).toBe(1);
    expect(get(p, 'v1').audio.fadeIn).toBe(0);
    expect(get(setClipAudio(base(), 'v1', { pan: -9 }), 'v1').audio.pan).toBe(-1);
  });
  it('rejects non-finite values', () => {
    expect(() => setClipAudio(base(), 'v1', { pan: NaN })).toThrow(new TimelineError('Invalid audio setting'));
    expect(() => setClipAudio(base(), 'v1', { fadeIn: Infinity })).toThrow(TimelineError);
  });
  it('returns the same reference for a no-op and never mutates', () => {
    const p = base();
    const before = frozen(p);
    expect(setClipAudio(p, 'v1', { pan: 0, fadeIn: 0 })).toBe(p);
    expect(setClipAudio(p, 'v1', {})).toBe(p);
    setClipAudio(p, 'v1', { pan: 0.5 });
    expect(frozen(p)).toBe(before);
  });
  it('refuses on a locked track', () => {
    const p0 = base();
    const p = setTrackFlags(p0, vTrack(p0).id, { locked: true });
    expect(() => setClipAudio(p, 'v1', { pan: 0.5 })).toThrow('Track is locked');
  });
});

describe('setTrackVolume', () => {
  it('clamps 0..2, works on locked tracks, no-op keeps reference', () => {
    const p0 = base();
    const t = aTracks(p0)[0];
    const p = setTrackFlags(p0, t.id, { locked: true });
    expect(aTracks(setTrackVolume(p, t.id, 5))[0].volume).toBe(2);
    expect(aTracks(setTrackVolume(p, t.id, -1))[0].volume).toBe(0);
    expect(setTrackVolume(p, t.id, 1)).toBe(p);
    expect(() => setTrackVolume(p, t.id, NaN)).toThrow(TimelineError);
  });
});

describe('setTrackDuck', () => {
  const two = (): Project => addTrack(base(), 'audio');
  it('sets and clears with clamping', () => {
    const p = two();
    const [a, b] = aTracks(p);
    const q = setTrackDuck(p, b.id, { sourceTrackId: a.id, amountDb: -99, attack: 0, release: 9 });
    expect(aTracks(q)[1].duck).toEqual({ sourceTrackId: a.id, amountDb: -40, attack: 0.01, release: 2 });
    expect(aTracks(setTrackDuck(q, b.id, null))[1].duck).toBeNull();
    expect(setTrackDuck(p, b.id, null)).toBe(p);
  });
  it('refuses self, unknown and cycles', () => {
    const p = two();
    const [a, b] = aTracks(p);
    const d = { amountDb: -10, attack: 0.1, release: 0.5 };
    expect(() => setTrackDuck(p, a.id, { ...d, sourceTrackId: a.id })).toThrow(TimelineError);
    expect(() => setTrackDuck(p, a.id, { ...d, sourceTrackId: 'nope' })).toThrow(TimelineError);
    const q = setTrackDuck(p, b.id, { ...d, sourceTrackId: a.id });
    expect(() => setTrackDuck(q, a.id, { ...d, sourceTrackId: b.id })).toThrow(TimelineError);
  });
});

describe('detachAudio', () => {
  it('copies audio onto the audio track and silences the video clip', () => {
    const p = base();
    const before = frozen(p);
    const q = detachAudio(p, 'v1');
    const a = aTracks(q)[0].clips[0];
    expect(a.kind).toBe('audio');
    expect([a.start, a.in, a.out, a.mediaId, a.volume]).toEqual([0, 0, 2, 'm1', 0.7]);
    expect(get(q, 'v1').audio.silent).toBe(true);
    expect(a.audio.silent).toBe(false);
    expect(frozen(p)).toBe(before);
  });
  it('skips locked audio tracks by adding a new one', () => {
    const p0 = base();
    const p = setTrackFlags(p0, aTracks(p0)[0].id, { locked: true });
    const q = detachAudio(p, 'v1');
    expect(aTracks(q)).toHaveLength(2);
    expect(aTracks(q)[0].clips).toHaveLength(0);
    expect(aTracks(q)[1].clips).toHaveLength(1);
  });
  it('uses a second track when the first has no room', () => {
    let p = base();
    p = addClip(p, aTracks(p)[0].id, clip('x', { kind: 'audio', start: 1 }));
    const q = detachAudio(p, 'v1');
    expect(aTracks(q)).toHaveLength(2);
    expect(aTracks(q)[0].clips).toHaveLength(1);
  });
  it('throws when nothing fits and 8 audio tracks exist', () => {
    let p = base();
    for (let i = 0; i < 7; i++) p = addTrack(p, 'audio');
    for (const t of aTracks(p)) p = addClip(p, t.id, clip(`x${t.id}`, { kind: 'audio', start: 1 }));
    expect(() => detachAudio(p, 'v1')).toThrow('Cannot add another audio track');
  });
  describe('keeps what is heard (mix settings of the video track)', () => {
    const setT = (p: Project, id: string, patch: Partial<Project['tracks'][number]>): Project => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    });
    const cases: [string, (p: Project) => Project][] = [
      ['volume', (p) => setT(p, vTrack(p).id, { volume: 0.5 })],
      ['muted', (p) => setT(p, vTrack(p).id, { muted: true })],
      ['solo', (p) => setT(p, vTrack(p).id, { solo: true })],
      ['duck', (p) => setT(p, vTrack(p).id, { duck: { sourceTrackId: aTracks(p)[0].id, amountDb: -9, attack: 0.1, release: 0.4 } })],
    ];
    for (const [name, mk] of cases) {
      it(`video track ${name} differs from the audio track: the copy goes on a NEW track with the video track's mix`, () => {
        const p = mk(base());
        const q = detachAudio(p, 'v1');
        expect(aTracks(q)).toHaveLength(2);
        expect(aTracks(q)[0].clips).toHaveLength(0);
        const fresh = aTracks(q)[1];
        expect(fresh.clips).toHaveLength(1);
        expect(fresh.name).toBe('');
        expect([fresh.volume, fresh.muted, fresh.solo, fresh.duck]).toEqual([vTrack(p).volume, vTrack(p).muted, vTrack(p).solo, vTrack(p).duck]);
      });
    }
    it('an audio track with the same mix settings as the video track is reused', () => {
      const p0 = base();
      const duck = { sourceTrackId: aTracks(p0)[1]?.id ?? 'other', amountDb: -9, attack: 0.1, release: 0.4 };
      let p = addTrack(p0, 'audio');
      const [a0, a1] = aTracks(p);
      p = setT(p, vTrack(p).id, { volume: 0.5, muted: true, duck: { ...duck, sourceTrackId: a0.id } });
      p = setT(p, a1.id, { volume: 0.5, muted: true, duck: { ...duck, sourceTrackId: a0.id } });
      p = setT(p, a0.id, { volume: 1, muted: false, duck: null });
      const q = detachAudio(p, 'v1');
      expect(aTracks(q)).toHaveLength(2);
      expect(aTracks(q)[0].clips).toHaveLength(0);
      expect(aTracks(q)[1].clips).toHaveLength(1);
    });
    it('first audio track muted but the video track is not: copy goes on a new track', () => {
      const p0 = base();
      const p = setT(p0, aTracks(p0)[0].id, { muted: true });
      const q = detachAudio(p, 'v1');
      expect(aTracks(q)).toHaveLength(2);
      expect(aTracks(q)[1].muted).toBe(false);
      expect(aTracks(q)[1].clips).toHaveLength(1);
    });
    it('the duck copied onto the new track is valid for setTrackDuck, and removeTrack still clears dependent ducks', () => {
      const p = cases[3][1](base());
      const q = detachAudio(p, 'v1');
      const fresh = aTracks(q)[1];
      expect(setTrackDuck(q, fresh.id, fresh.duck)).toBe(q);
      const r = removeTrack(q, aTracks(q)[0].id);
      expect(r.tracks.every((t) => t.duck === null)).toBe(true);
    });
    it('refuses when a new track would be needed but 8 audio tracks exist', () => {
      const b = base();
      let p = setT(b, vTrack(b).id, { volume: 0.5 });
      for (let i = 0; i < 7; i++) p = addTrack(p, 'audio');
      expect(() => detachAudio(p, 'v1')).toThrow('Cannot add another audio track');
    });
  });
  it('refuses media without audio, double detach, audio clips and locked source', () => {
    expect(() => detachAudio(base(false), 'v1')).toThrow(TimelineError);
    const q = detachAudio(base(), 'v1');
    expect(() => detachAudio(q, 'v1')).toThrow(TimelineError);
    expect(() => detachAudio(q, aTracks(q)[0].clips[0].id)).toThrow(TimelineError);
    const p0 = base();
    const locked = setTrackFlags(p0, vTrack(p0).id, { locked: true });
    expect(() => detachAudio(locked, 'v1')).toThrow('Track is locked');
  });
  it('copies fades, pan and effects with new effect ids', () => {
    let p = setClipAudio(base(), 'v1', { fadeIn: 0.5, pan: 0.3 });
    p = addEffect(p, 'v1', 'gain');
    const q = detachAudio(p, 'v1');
    const a = aTracks(q)[0].clips[0];
    expect([a.audio.fadeIn, a.audio.pan]).toEqual([0.5, 0.3]);
    expect(a.audio.effects).toHaveLength(1);
    expect(a.audio.effects[0].id).not.toBe(get(q, 'v1').audio.effects[0].id);
  });
  it('attachAudio restores sound and deletes the audio clip', () => {
    const q = detachAudio(base(), 'v1');
    const aid = aTracks(q)[0].clips[0].id;
    const r = attachAudio(q, 'v1', aid);
    expect(get(r, 'v1').audio.silent).toBe(false);
    expect(aTracks(r)[0].clips).toHaveLength(0);
    expect(() => attachAudio(q, 'v1', 'v1')).toThrow(TimelineError);
    const other = addClip(q, aTracks(q)[0].id, clip('o', { kind: 'audio', mediaId: 'zz', start: 5 }));
    expect(() => attachAudio(other, 'v1', 'o')).toThrow(TimelineError);
  });
});

describe('split / trim / join', () => {
  it('split divides fades and gives effects new ids', () => {
    let p = setClipAudio(base(), 'v1', { fadeIn: 0.5, fadeOut: 0.4, pan: 0.2 });
    p = addEffect(p, 'v1', 'gain');
    const q = splitClip(p, 'v1', 1);
    const [l, r] = vTrack(q).clips;
    expect([l.audio.fadeIn, l.audio.fadeOut, r.audio.fadeIn, r.audio.fadeOut]).toEqual([0.5, 0, 0, 0.4]);
    expect([l.audio.pan, r.audio.pan]).toEqual([0.2, 0.2]);
    const ids = [...l.audio.effects, ...r.audio.effects].map((e) => e.id);
    expect(new Set(ids).size).toBe(2);
    expect(ids).not.toContain(get(p, 'v1').audio.effects[0].id);
    expect(get(p, 'v1').audio.effects).toHaveLength(1);
  });
  it('split keeps each half\'s fades within its duration', () => {
    const p = setClipAudio(base(), 'v1', { fadeIn: 1.5 });
    const [l, r] = vTrack(splitClip(p, 'v1', 1)).clips;
    expect(l.audio.fadeIn).toBe(1);
    expect(r.audio.fadeIn).toBe(0);
    const q = setClipAudio(setClipAudio(base(), 'v1', { fadeIn: 1 }), 'v1', { fadeOut: 1 });
    for (const t of [0.05, 1, 1.95]) {
      for (const h of vTrack(splitClip(q, 'v1', t)).clips) {
        expect(h.audio.fadeIn + h.audio.fadeOut).toBeLessThanOrEqual(h.out - h.in + 1e-9);
      }
    }
    const [l2, r2] = vTrack(splitClip(setClipAudio(base(), 'v1', { fadeOut: 1.5 }), 'v1', 1.5)).clips;
    expect([l2.audio.fadeOut, r2.audio.fadeOut]).toEqual([0, 0.5]);
  });
  it('trim re-clamps fades and leaves audio untouched when nothing changes', () => {
    const p = setClipAudio(setClipAudio(base(), 'v1', { fadeIn: 1 }), 'v1', { fadeOut: 1 });
    const q = trimClip(p, 'v1', 'end', 1);
    expect(get(q, 'v1').audio.fadeIn + get(q, 'v1').audio.fadeOut).toBeLessThanOrEqual(1);
    expect(get(q, 'v1').audio.fadeIn).toBe(1);
    expect(get(q, 'v1').audio.fadeOut).toBe(0);
    const p2 = base();
    const same = trimClip(p2, 'v1', 'end', 2);
    expect(get(same, 'v1').audio).toBe(get(p2, 'v1').audio);
  });
  it('join keeps the first clip audio settings', () => {
    let p = setClipAudio(base(), 'v1', { pan: 0.5 });
    p = addClip(p, vTrack(p).id, clip('v2', { start: 3 }));
    const q = joinClips(p, ['v1', 'v2']);
    expect(get(q, 'v1').audio.pan).toBe(0.5);
    expect(get(q, 'v2').audio.pan).toBe(0);
  });
});

describe('effects', () => {
  it('add, update, move, remove with unique ids', () => {
    const p0 = base();
    const before = frozen(p0);
    let p = addEffect(p0, 'v1', 'eq');
    p = addEffect(p, 'v1', 'gain');
    expect(frozen(p0)).toBe(before);
    const [e1, e2] = get(p, 'v1').audio.effects;
    expect(e1.id).not.toBe(e2.id);
    expect(e1.enabled).toBe(true);
    p = updateEffect(p, 'v1', e1.id, { enabled: false, params: { high: 3, gainDb: 3, bad: NaN } });
    expect(get(p, 'v1').audio.effects[0]).toMatchObject({ enabled: false, params: { low: 0, mid: 0, high: 3 } });
    // Keys of another effect type and non-finite values are dropped by the registry's clampParams.
    expect('gainDb' in get(p, 'v1').audio.effects[0].params).toBe(false);
    expect('bad' in get(p, 'v1').audio.effects[0].params).toBe(false);
    expect(updateEffect(p, 'v1', e1.id, { enabled: false })).toBe(p);
    p = moveEffect(p, 'v1', e1.id, 1);
    expect(get(p, 'v1').audio.effects.map((e) => e.id)).toEqual([e2.id, e1.id]);
    expect(moveEffect(p, 'v1', e1.id, 1)).toBe(p);
    p = removeEffect(p, 'v1', e2.id);
    expect(get(p, 'v1').audio.effects.map((e) => e.id)).toEqual([e1.id]);
    expect(() => removeEffect(p, 'v1', 'nope')).toThrow(TimelineError);
  });
  it('refuses on a locked track', () => {
    const p0 = base();
    const p = setTrackFlags(p0, vTrack(p0).id, { locked: true });
    expect(() => addEffect(p, 'v1', 'eq')).toThrow('Track is locked');
  });
});

