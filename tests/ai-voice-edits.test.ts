import { describe, expect, it } from 'vitest';
import { emptyProject } from '../src/core/model';
import type { MediaRef } from '../src/core/model';
import { aiVoiceName, placeAudioMedia } from '../src/ui/recordEdits';

describe('naming', () => {
  it('AI voice N uses the lowest free number', () => {
    const p = emptyProject();
    expect(aiVoiceName(p)).toBe('AI voice 1');
    const m = (id: string, name: string): MediaRef => ({ id, name, kind: 'audio', duration: 1, hasAudio: true });
    expect(aiVoiceName({ ...p, media: { a: m('a', 'AI voice 1'), b: m('b', 'Voice-over 2'), c: m('c', 'AI voice 3') } })).toBe('AI voice 2');
  });
  it('placeAudioMedia places like a recording', () => {
    const p = emptyProject();
    const m: MediaRef = { id: 'a', name: 'AI voice 1', kind: 'audio', duration: 2, hasAudio: true };
    const next = placeAudioMedia(p, m, 3, null);
    expect(next.tracks.find((t) => t.kind === 'audio')?.clips[0]).toMatchObject({ mediaId: 'a', start: 3, in: 0, out: 2 });
  });
});

