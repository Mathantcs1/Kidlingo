import { describe, expect, it } from 'vitest';
import { detachAudio } from '../src/core/audioEdits';
import { canDetach, detachDisabledReason, findDetachedTwin, formatPan, isAudioCapable } from '../src/core/audioQueries';
import { addClip } from '../src/core/timeline';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';

const media = (id: string, kind: MediaRef['kind'], hasAudio: boolean): MediaRef =>
  ({ id, kind, hasAudio, name: id, duration: 10, missing: false }) as unknown as MediaRef;

function clip(id: string, mediaId: string, kind: Clip['kind']): Clip {
  return { id, mediaId, kind, start: 1, in: 0, out: 4, transform: defaultTransform(), volume: 1, fit: 'fit', audio: defaultClipAudio() };
}

function base(): Project {
  let p = emptyProject();
  p = { ...p, media: { v: media('v', 'video', true), n: media('n', 'video', false), i: media('i', 'image', false) } };
  const vt = p.tracks.find((t) => t.kind === 'video')!;
  p = addClip(p, vt.id, clip('cv', 'v', 'video'));
  p = addClip(p, vt.id, { ...clip('cn', 'n', 'video'), start: 10 });
  p = addClip(p, vt.id, { ...clip('ci', 'i', 'image'), start: 20 });
  return p;
}

describe('formatPan', () => {
  it('shows C, L and R percentages', () => {
    expect(formatPan(0)).toBe('C');
    expect(formatPan(-0.4)).toBe('L40');
    expect(formatPan(1)).toBe('R100');
    expect(formatPan(-5)).toBe('L100');
  });
});

describe('canDetach', () => {
  it('only for one unlocked, not yet detached video with sound', () => {
    const p = base();
    expect(canDetach(p, ['cv'])).toBe(true);
    expect(canDetach(p, ['cn'])).toBe(false);
    expect(canDetach(p, ['ci'])).toBe(false);
    expect(canDetach(p, ['cv', 'cn'])).toBe(false);
    expect(canDetach(p, [])).toBe(false);
    expect(canDetach(p, ['missing'])).toBe(false);
    const locked = { ...p, tracks: p.tracks.map((t) => (t.kind === 'video' ? { ...t, locked: true } : t)) };
    expect(canDetach(locked, ['cv'])).toBe(false);
    expect(canDetach(detachAudio(p, 'cv'), ['cv'])).toBe(false);
  });
});

describe('findDetachedTwin', () => {
  it('finds the audio clip made by detachAudio, and nothing otherwise', () => {
    const p = base();
    expect(findDetachedTwin(p, 'cv')).toBeNull();
    const d = detachAudio(p, 'cv');
    const twin = findDetachedTwin(d, 'cv');
    expect(twin?.kind).toBe('audio');
    expect(twin?.mediaId).toBe('v');
    // Twin moved: no longer identical, so nothing is offered.
    const moved = {
      ...d,
      tracks: d.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === twin!.id ? { ...c, start: 5 } : c)) })),
    };
    expect(findDetachedTwin(moved, 'cv')).toBeNull();
    expect(findDetachedTwin(d, 'nope')).toBeNull();
  });
});

describe('isAudioCapable', () => {
  it('audio and videos with sound only', () => {
    const p = base();
    expect(isAudioCapable(clip('a', 'v', 'audio'), p.media.v)).toBe(true);
    expect(isAudioCapable(clip('b', 'v', 'video'), p.media.v)).toBe(true);
    expect(isAudioCapable(clip('c', 'n', 'video'), p.media.n)).toBe(false);
    expect(isAudioCapable(clip('d', 'i', 'image'), p.media.i)).toBe(false);
  });
});

describe('detachDisabledReason', () => {
  it('names why Detach is unavailable, null when it is available', () => {
    const p = base();
    expect(detachDisabledReason(p, ['cv'])).toBeNull();
    expect(detachDisabledReason(p, [])).toBe('Select a single clip');
    expect(detachDisabledReason(p, ['cv', 'cn'])).toBe('Select a single clip');
    expect(detachDisabledReason(p, ['ci'])).toBe('Images have no sound');
    expect(detachDisabledReason(p, ['cn'])).toBe('This clip has no audio');
    const locked = { ...p, tracks: p.tracks.map((t) => (t.kind === 'video' ? { ...t, locked: true } : t)) };
    expect(detachDisabledReason(locked, ['cv'])).toBe('Track is locked');
    expect(detachDisabledReason(detachAudio(p, 'cv'), ['cv'])).toBe('Audio is already detached');
  });
});

describe('findDetachedTwin strictness', () => {
  const edit = (p: Project, id: string, fn: (c: Clip) => Clip): Project => ({
    ...p,
    tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === id ? fn(c) : c)) })),
  });
  it('offers only an unedited twin', () => {
    const d = detachAudio(base(), 'cv');
    const twin = findDetachedTwin(d, 'cv')!;
    const edits: ((c: Clip) => Clip)[] = [
      (c) => ({ ...c, audio: { ...c.audio, fadeIn: 0.5 } }),
      (c) => ({ ...c, audio: { ...c.audio, fadeOut: 0.5 } }),
      (c) => ({ ...c, audio: { ...c.audio, pan: 0.3 } }),
      (c) => ({ ...c, audio: { ...c.audio, effects: [{ id: 'e', type: 'gain', enabled: true, params: {} } as never] } }),
      (c) => ({ ...c, volume: 0.5 }),
    ];
    for (const fn of edits) expect(findDetachedTwin(edit(d, twin.id, fn), 'cv')).toBeNull();
    expect(findDetachedTwin(d, 'cv')?.id).toBe(twin.id);
  });
  it('offers the twin when the video clip had audio settings before Detach, but not once the twin differs from them', () => {
    let p = base();
    const e = { id: 'e1', type: 'gain', enabled: true, params: { gainDb: 3 } } as never;
    p = edit(p, 'cv', (c) => ({ ...c, audio: { ...c.audio, fadeIn: 0.5, fadeOut: 0.25, pan: -0.3, effects: [e] } }));
    const d = detachAudio(p, 'cv');
    const twin = findDetachedTwin(d, 'cv');
    expect(twin?.kind).toBe('audio');
    const tweaks: ((c: Clip) => Clip)[] = [
      (c) => ({ ...c, audio: { ...c.audio, fadeIn: 0.6 } }),
      (c) => ({ ...c, audio: { ...c.audio, pan: 0 } }),
      (c) => ({ ...c, audio: { ...c.audio, effects: [] } }),
      (c) => ({ ...c, audio: { ...c.audio, effects: c.audio.effects.map((x) => ({ ...x, params: { gainDb: 4 } })) } }),
      (c) => ({ ...c, audio: { ...c.audio, effects: c.audio.effects.map((x) => ({ ...x, enabled: false })) } }),
      (c) => ({ ...c, volume: 0.4 }),
    ];
    for (const fn of tweaks) expect(findDetachedTwin(edit(d, twin!.id, fn), 'cv')).toBeNull();
  });
  it('offers nothing when two clips match', () => {
    const d = detachAudio(base(), 'cv');
    const twin = findDetachedTwin(d, 'cv')!;
    const at = d.tracks.find((t) => t.kind === 'audio')!;
    const second = d.tracks.some((t) => t.kind === 'audio' && t.id !== at.id)
      ? d
      : { ...d, tracks: [...d.tracks, { ...at, id: 'a2', clips: [{ ...twin, id: 'dup' }] }] };
    expect(findDetachedTwin(second, 'cv')).toBeNull();
  });
});
