import { describe, expect, it } from 'vitest';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { addTrack } from '../src/core/tracks';
import { placeRecording, voiceOverName } from '../src/ui/recordEdits';

const media = (id: string, name: string, duration = 2): MediaRef => ({ id, name, kind: 'audio', duration, hasAudio: true });

const audioClip = (id: string, start: number, out = 1): Clip => ({
  id,
  mediaId: 'old',
  kind: 'audio',
  start,
  in: 0,
  out,
  transform: defaultTransform(),
  volume: 1,
  audio: defaultClipAudio(), effects: [], blend: 'normal',
  fit: 'fit',
});

function base(): Project {
  const p = emptyProject();
  return { ...p, media: { old: media('old', 'music.wav', 10) } };
}

const audioTrack = (p: Project, i = 0) => p.tracks.filter((t) => t.kind === 'audio')[i];

function withClips(p: Project, trackId: string, clips: Clip[], locked = false): Project {
  return { ...p, tracks: p.tracks.map((t) => (t.id === trackId ? { ...t, clips, locked } : t)) };
}

describe('voiceOverName', () => {
  it('uses the lowest free number', () => {
    const p = base();
    expect(voiceOverName(p)).toBe('Voice-over 1');
    const named = { ...p, media: { a: media('a', 'Voice-over 1'), b: media('b', 'Voice-over 3'), c: media('c', 'Voice-over 2x') } };
    expect(voiceOverName(named)).toBe('Voice-over 2');
  });
});

describe('placeRecording', () => {
  it('registers the media and places a full-length clip at the recorded start on the active audio track', () => {
    const p = base();
    const track = audioTrack(p);
    const m = media('vo', 'Voice-over 1', 2);
    const next = placeRecording(p, m, 3.5, track.id);
    expect(next.media.vo).toEqual(m);
    expect(next.tracks).toHaveLength(2);
    const [clip] = audioTrack(next).clips;
    expect(clip).toMatchObject({ mediaId: 'vo', kind: 'audio', start: 3.5, in: 0, out: 2 });
    expect(p.media.vo).toBeUndefined();
    expect(audioTrack(p).clips).toHaveLength(0);
  });

  it('falls back to the first audio track when the active track is not audio', () => {
    const p = base();
    const next = placeRecording(p, media('vo', 'Voice-over 1'), 0, p.tracks[0].id);
    expect(audioTrack(next).clips).toHaveLength(1);
    expect(next.tracks).toHaveLength(2);
    expect(audioTrack(placeRecording(p, media('vo', 'V'), 0, null)).clips).toHaveLength(1);
  });

  it('creates a new audio track when the target is locked', () => {
    const p0 = base();
    const p = withClips(p0, audioTrack(p0).id, [], true);
    const next = placeRecording(p, media('vo', 'Voice-over 1'), 1, audioTrack(p).id);
    expect(next.tracks).toHaveLength(3);
    expect(audioTrack(next, 0).clips).toHaveLength(0);
    expect(audioTrack(next, 1).clips[0]).toMatchObject({ mediaId: 'vo', start: 1 });
  });

  it('creates a new audio track when the recording would overlap a clip', () => {
    const p0 = base();
    const p = withClips(p0, audioTrack(p0).id, [audioClip('x', 2, 1)]);
    const next = placeRecording(p, media('vo', 'Voice-over 1', 2), 1, audioTrack(p).id);
    expect(next.tracks).toHaveLength(3);
    expect(audioTrack(next, 1).clips[0]).toMatchObject({ mediaId: 'vo', start: 1 });
    // A take that ends before the clip fits on the same track.
    const fits = placeRecording(p, media('vo', 'Voice-over 1', 1), 0.5, audioTrack(p).id);
    expect(fits.tracks).toHaveLength(2);
    expect(audioTrack(fits).clips).toHaveLength(2);
  });

  it('creates an audio track when there is none, and refuses past the track limit', () => {
    const p0 = base();
    const noAudio = { ...p0, tracks: p0.tracks.filter((t) => t.kind === 'video') };
    expect(audioTrack(placeRecording(noAudio, media('vo', 'V'), 0, null)).clips).toHaveLength(1);
    let full = noAudio;
    for (let i = 0; i < 8; i++) full = addTrack(full, 'audio');
    full = { ...full, tracks: full.tracks.map((t) => (t.kind === 'audio' ? { ...t, locked: true } : t)) };
    expect(() => placeRecording(full, media('vo', 'V'), 0, null)).toThrow(TimelineError);
  });

  it('with 8 audio tracks, the active one full and another with room, places the take on the first track with room', () => {
    let p = base();
    for (let i = 0; i < 7; i++) p = addTrack(p, 'audio');
    const full = audioTrack(p, 2);
    p = withClips(p, full.id, [audioClip('x', 0, 10)]);
    p = withClips(p, audioTrack(p, 0).id, [audioClip('y', 0, 10)]);
    const next = placeRecording(p, media('vo', 'Voice-over 1', 2), 1, full.id);
    expect(next.tracks.filter((t) => t.kind === 'audio')).toHaveLength(8);
    expect(audioTrack(next, 1).clips[0]).toMatchObject({ mediaId: 'vo', start: 1 });
    expect(audioTrack(next, 0).clips).toHaveLength(1);
    expect(audioTrack(next, 2).clips).toHaveLength(1);
  });

  it('with 8 full audio tracks refuses with a TimelineError', () => {
    let p = base();
    for (let i = 0; i < 7; i++) p = addTrack(p, 'audio');
    for (const t of p.tracks.filter((x) => x.kind === 'audio')) p = withClips(p, t.id, [audioClip(`x${t.id}`, 0, 10)]);
    expect(() => placeRecording(p, media('vo', 'V'), 1, audioTrack(p, 0).id)).toThrow(TimelineError);
  });
});
