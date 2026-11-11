// Synthetic WAV fixtures for the audio effect specs (generated once with ffmpeg into the e2e fixture directory).
import { execFileSync } from 'node:child_process';
import { existsSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { ensureFixtures } from './fixtures';

/** Mono 48 kHz 16-bit WAV of an ffmpeg `aevalsrc` expression in `t` (seconds) / `n` (sample index). */
function wav(name: string, expr: string, seconds: number): string {
  const out = join(ensureFixtures(), name);
  if (existsSync(out)) return out;
  const tmp = `${out}.part.wav`;
  rmSync(tmp, { force: true });
  execFileSync('ffmpeg', [
    '-y', '-loglevel', 'error', '-f', 'lavfi', '-i', `aevalsrc=exprs='${expr}':s=48000:d=${seconds}`,
    '-c:a', 'pcm_s16le', tmp,
  ], { stdio: 'pipe' });
  renameSync(tmp, out);
  return out;
}

export const audioFixtures = () => ({
  /** Sine tones at 0.25 amplitude, 3 s. */
  tone100: wav('fx-tone-100.wav', '0.25*sin(2*PI*100*t)', 3),
  tone4k: wav('fx-tone-4k.wav', '0.25*sin(2*PI*4000*t)', 3),
  tone8k: wav('fx-tone-8k.wav', '0.25*sin(2*PI*8000*t)', 3),
  /** 440 Hz sine at 0.25 amplitude, 3 s (pitch shifting). */
  tone440: wav('fx-tone-440.wav', '0.25*sin(2*PI*440*t)', 3),
  /** White noise at 0.05 amplitude; from 1.5 s a 0.3 amplitude 440 Hz tone on top (noise reduction), 3 s. */
  hiss: wav('fx-hiss.wav', '0.05*(2*random(0)-1)+0.3*gte(t,1.5)*sin(2*PI*440*t)', 3),
  /**
   * Stationary white noise at 0.05 amplitude under 0.3 amplitude 440 Hz bursts (0.25 s on, 0.25 s off), 5 s: speech-
   * like audio whose pauses hold the noise floor in every decoded piece (noise-reduction seams).
   */
  steady: wav('fx-hiss-bursts.wav', '0.05*(2*random(0)-1)+0.3*lt(mod(t,0.5),0.25)*sin(2*PI*440*t)', 5),
  /** A 10-sample 0.8 click at 0.1 s, then silence (2 s). */
  click: wav('fx-click.wav', '0.8*between(n,4800,4809)', 2),
  /** 1 kHz: 0.05 amplitude for 2 s, then 0.8 for 2 s. */
  bursts: wav('fx-bursts.wav', '(0.05*lt(t,2)+0.8*gte(t,2))*sin(2*PI*1000*t)', 4),
  /** 1 kHz: 0.8 amplitude for 2 s, then 0.01 for 6 s (a compressor's long recovery after loud audio). */
  loudThenQuiet: wav('fx-loud-quiet.wav', '(0.8*lt(t,2)+0.01*gte(t,2))*sin(2*PI*1000*t)', 8),
  /** 5 s burst of a 440 Hz tone plus pseudo-random noise (with a level step at 2.5 s), for the seam tests. */
  noisy: wav('fx-noisy.wav', '(0.15+0.25*gte(t,2.5))*sin(2*PI*440*t)+0.15*sin(n*n*0.0001+n*0.7)', 5),
});
