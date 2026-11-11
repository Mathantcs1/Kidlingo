// DOM-free effect parameter schema: ranges, defaults, clamping and the decode margins each effect needs (D7).
// src/core may import this file; the Web Audio builders live in sibling files that only the engine imports.
import type { AudioEffect, AudioEffectType } from '../../core/model';

export interface ParamDef {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  def: number;
  unit?: string;
}

/** Seconds of extra source audio an effect needs decoded before (`pre`) / after (`post`) a segment. */
export interface Margins {
  pre: number;
  post: number;
}

export interface EffectSchema {
  type: AudioEffectType;
  label: string;
  params: ParamDef[];
  /** False until the effect has a real builder (pitch and denoise arrive in Plan 3 Task 7). */
  available: boolean;
  /**
   * The effects are causal, so state carried across a window cut is HISTORY: `pre` is how much earlier audio
   * the chain must have heard for its output inside the segment to equal an uncut render (filter warm-up,
   * reverb impulse length, echo repeats). `post` is look-ahead for effects that need later audio (Task 7).
   * Tails never sound past the clip end (live and export alike), so no effect needs audio decoded past it.
   */
  margins(params: Record<string, number>): Margins;
}

const p = (key: string, label: string, min: number, max: number, step: number, def: number, unit?: string): ParamDef =>
  ({ key, label, min, max, step, def, unit });

/** Filter / EQ warm-up: a 20 Hz biquad settles to < 1e-6 well within this. */
const WARM_UP = 0.5;
/** Echo history: enough repeats to fall below -80 dB, capped (a 0.9 feedback at 1 s would need 88 s). */
const ECHO_FLOOR = 1e-4;
export const ECHO_MAX_PRE = 30;

function echoPre(params: Record<string, number>): number {
  const { delay, feedback } = params;
  const repeats = feedback > 0 ? Math.ceil(Math.log(ECHO_FLOOR) / Math.log(feedback)) : 1;
  return Math.min(ECHO_MAX_PRE, delay * repeats);
}

const warm = (): Margins => ({ pre: WARM_UP, post: 0 });

export const EFFECT_SCHEMAS: Record<AudioEffectType, EffectSchema> = {
  eq: {
    type: 'eq',
    label: 'EQ',
    available: true,
    params: [p('low', 'Low (200 Hz)', -12, 12, 0.5, 0, 'dB'), p('mid', 'Mid (1 kHz)', -12, 12, 0.5, 0, 'dB'), p('high', 'High (4 kHz)', -12, 12, 0.5, 0, 'dB')],
    margins: warm,
  },
  highpass: { type: 'highpass', label: 'High-pass', available: true, params: [p('freq', 'Cutoff', 20, 1000, 1, 80, 'Hz')], margins: warm },
  lowpass: { type: 'lowpass', label: 'Low-pass', available: true, params: [p('freq', 'Cutoff', 1000, 20000, 10, 8000, 'Hz')], margins: warm },
  compressor: {
    type: 'compressor',
    label: 'Compressor',
    available: true,
    params: [
      p('threshold', 'Threshold', -60, 0, 1, -24, 'dB'),
      p('ratio', 'Ratio', 1, 20, 0.5, 4, ':1'),
      p('attack', 'Attack', 0.001, 0.2, 0.001, 0.005, 's'),
      p('release', 'Release', 0.01, 1, 0.01, 0.25, 's'),
      p('makeup', 'Makeup', 0, 24, 0.5, 0, 'dB'),
    ],
    // The detector's memory is a few release times.
    margins: (q) => ({ pre: WARM_UP + 2 * q.release, post: 0 }),
  },
  reverb: {
    type: 'reverb',
    label: 'Reverb',
    available: true,
    params: [p('seconds', 'Length', 0.2, 5, 0.1, 1.5, 's'), p('mix', 'Mix', 0, 1, 0.05, 0.3)],
    // A convolution only remembers its impulse length.
    margins: (q) => ({ pre: q.seconds, post: 0 }),
  },
  echo: {
    type: 'echo',
    label: 'Echo',
    available: true,
    params: [p('delay', 'Delay', 0.05, 1, 0.01, 0.3, 's'), p('feedback', 'Feedback', 0, 0.9, 0.05, 0.4), p('mix', 'Mix', 0, 1, 0.05, 0.4)],
    margins: (q) => ({ pre: echoPre(q), post: 0 }),
  },
  pitch: {
    type: 'pitch',
    label: 'Pitch',
    available: false,
    params: [p('semitones', 'Semitones', -12, 12, 1, 0, 'st')],
    margins: () => ({ pre: 0.2, post: 0.2 }),
  },
  denoise: {
    type: 'denoise',
    label: 'Noise reduction',
    available: false,
    params: [p('strength', 'Strength', 0, 1, 0.05, 0.5)],
    margins: () => ({ pre: 0.2, post: 0.2 }),
  },
  gain: { type: 'gain', label: 'Gain', available: true, params: [p('gainDb', 'Gain', -24, 24, 0.1, 0, 'dB')], margins: () => ({ pre: 0, post: 0 }) },
};

export function defaultParams(type: AudioEffectType): Record<string, number> {
  return Object.fromEntries(EFFECT_SCHEMAS[type].params.map((d) => [d.key, d.def]));
}

/** A clean copy: every schema key present and clamped to its range; non-finite ⇒ default; unknown keys dropped. */
export function clampParams(type: AudioEffectType, params: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of EFFECT_SCHEMAS[type].params) {
    const v = params[d.key];
    out[d.key] = typeof v === 'number' && Number.isFinite(v) ? Math.min(d.max, Math.max(d.min, v)) : d.def;
  }
  return out;
}

/** Margins of a whole chain: the sum over its enabled effects (each effect delays the next one's history). */
export function chainMargins(effects: readonly AudioEffect[]): Margins {
  let pre = 0;
  let post = 0;
  for (const e of effects) {
    if (!e.enabled) continue;
    const m = EFFECT_SCHEMAS[e.type].margins(clampParams(e.type, e.params));
    pre += m.pre;
    post += m.post;
  }
  return { pre, post };
}
