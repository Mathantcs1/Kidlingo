// Shared builders for the transition tests: video tracks of back-to-back clips with footage handles around every cut.
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';

export const FPS = 30;
export const mk = (id: string, start: number, inn: number, out: number, extra: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm1', kind: 'video', start, in: inn, out, transform: defaultTransform(), volume: 1, fit: 'fit',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});

/** Video track 'v' with clips a (0..4, footage 2..6), b (4..8, footage 2..6), c (8..12, footage 2..6) on a 60 s file; track 'v2' empty; audio track 'a'. */
export function base(clips?: Clip[]): Project {
  const p = emptyProject('youtube');
  p.format = { ...p.format, fps: FPS };
  p.media.m1 = { id: 'm1', name: 'a.mp4', kind: 'video', duration: 60, width: 1920, height: 1080, hasAudio: true };
  p.tracks[0] = { ...p.tracks[0], id: 'v', clips: clips ?? [mk('a', 0, 2, 6), mk('b', 4, 2, 6), mk('c', 8, 2, 6)] };
  return p;
}
export const trackOf = (p: Project, id = 'v') => p.tracks.find((t) => t.id === id)!;
