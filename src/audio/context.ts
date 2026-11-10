// The one long-lived AudioContext for live playback. Light on purpose: imported by the Play command at startup.

let shared: AudioContext | null = null;

/**
 * Creates the shared AudioContext on first use and resumes it. Call this synchronously inside the user gesture
 * that starts playback (the Play click or the Space key): browsers only let a context start from a gesture, and
 * a context created or resumed after an await can stay suspended, freezing the clock. Returns null where Web
 * Audio is unavailable.
 */
export function unlockAudio(): AudioContext | null {
  if (typeof AudioContext === 'undefined') return null;
  if (!shared || shared.state === 'closed') shared = new AudioContext();
  void shared.resume().catch(() => undefined);
  return shared;
}

/** The shared context (created, and resumed, on demand when no gesture unlocked it first). */
export function sharedAudioContext(): AudioContext {
  const ctx = unlockAudio();
  if (!ctx) throw new Error('This browser cannot play audio (no Web Audio)');
  return ctx;
}
