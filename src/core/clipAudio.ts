import type { AudioEffect, Clip, ClipAudio } from './model';
import { newId } from './model';

/** Copies the effect list with NEW ids (ids must stay unique across clips after split/detach). */
export function cloneEffects(effects: AudioEffect[]): AudioEffect[] {
  return effects.map((e) => ({ ...e, id: newId(), params: { ...e.params } }));
}

/** Fades must fit the clip: fadeIn + fadeOut <= duration. Shrinks fadeOut first, then fadeIn. Same reference if fine. */
export function fitFades(audio: ClipAudio, duration: number): ClipAudio {
  if (audio.fadeIn + audio.fadeOut <= duration) return audio;
  const fadeIn = Math.min(audio.fadeIn, duration);
  return { ...audio, fadeIn, fadeOut: Math.max(0, duration - fadeIn) };
}

export function withAudio(c: Clip, audio: ClipAudio): Clip {
  return audio === c.audio ? c : { ...c, audio };
}
