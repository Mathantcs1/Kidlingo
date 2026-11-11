// Shared fixtures for the overlay clip unit tests.
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';

export const video = (id: string, over: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm1', kind: 'video', start: 0, in: 0, out: 4, transform: defaultTransform(), volume: 1,
  audio: defaultClipAudio(), effects: [], blend: 'normal', fit: 'fit', ...over,
});

/** One video track 'v' holding a 0..4 s video clip 'c1' of media 'm1', and an empty audio track 'a'. */
export function base(): Project {
  const p = emptyProject();
  return {
    ...p,
    media: { m1: { id: 'm1', name: 'a.mp4', kind: 'video', duration: 10, width: 1920, height: 1080, fps: 30, hasAudio: true } },
    tracks: p.tracks.map((t) => (t.kind === 'video' ? { ...t, id: 'v', clips: [video('c1')] } : { ...t, id: 'a' })),
  };
}
export const all = (p: Project): Clip[] => p.tracks.flatMap((t) => t.clips);
export const overlays = (p: Project): Clip[] => all(p).filter((c) => c.kind === 'overlay');
