// Shared builders for the pitch / noise-reduction specs: effects with default params and one-clip projects.
import { clipOf, project } from './harness-helpers';
import { defaultParams } from '../../src/audio/effects/params';
import { defaultClipAudio } from '../../src/core/model';
import type { AudioEffect, AudioEffectType, Clip, MediaRef, Project } from '../../src/core/model';

export const SR = 48000;
export const FPS = 10;
export const db = (r: number): number => 20 * Math.log10(r);

let seq = 0;
export const effect = (type: AudioEffectType, params: Record<string, number> = {}): AudioEffect => ({
  id: `fx-${++seq}`,
  type,
  enabled: true,
  params: { ...defaultParams(type), ...params },
});

/** A project whose audio track holds one clip of `m` with `effects`. */
export function withEffects(m: MediaRef, effects: AudioEffect[], over: Partial<Clip> = {}): Project {
  const clip = clipOf(m, { ...over, audio: { ...defaultClipAudio(), effects } });
  const p = project({ width: 64, height: 36, fps: FPS }, [m], []);
  return { ...p, tracks: p.tracks.map((t) => (t.kind === 'audio' ? { ...t, clips: [clip] } : t)) };
}
