// The effect shader registry (split out of programs.ts): which PassShader draws each effect type, and the types
// turned off this session after a failure (D8; programs.ts records the failures).
import type { VideoEffectType } from '../../core/model';
import { BLUR, GLOW, PIXELATE, SHARPEN } from './shaders/blurFamily';
import { CHROMA_KEY } from './shaders/chromaKey';
import { COLOUR } from './shaders/colour';
import { BW, GRAIN, SEPIA, SPLIT_TONE, VIGNETTE } from './shaders/look';
import { LUT } from './shaders/lut';
import { GLITCH, INVERT, MIRROR, RGB_SPLIT, VHS_SHADER } from './shaders/stylise';
import type { PassShader } from './types';

/**
 * The shader of each available effect. Each effect task adds its entry here (from its own module under ./shaders)
 * when it flips `VIDEO_EFFECTS[type].available`; a type without an entry is skipped by the pipeline.
 */
export const PASS_SHADERS: Partial<Record<VideoEffectType, PassShader>> = {
  colour: COLOUR,
  bw: BW,
  sepia: SEPIA,
  splitTone: SPLIT_TONE,
  vignette: VIGNETTE,
  grain: GRAIN,
  lut: LUT,
  blur: BLUR,
  sharpen: SHARPEN,
  glow: GLOW,
  pixelate: PIXELATE,
  rgbSplit: RGB_SPLIT,
  glitch: GLITCH,
  vhs: VHS_SHADER,
  mirror: MIRROR,
  invert: INVERT,
  chromaKey: CHROMA_KEY,
};

/** The types whose registered shader failed this session (filled by programs.ts `markUnavailable`). */
export const failedTypes = new Set<VideoEffectType>();

/** Every effect type turned off this session (compile/link or run-time failure), in failure order (D8). */
export function unavailableTypes(): VideoEffectType[] {
  return [...failedTypes];
}

/** Registers (or, with undefined, removes) a type's shader. Used by tests and the dev harness's test-only effects. */
export function registerPassShader(type: VideoEffectType, shader: PassShader | undefined): void {
  if (shader) PASS_SHADERS[type] = shader;
  else delete PASS_SHADERS[type];
  failedTypes.delete(type);
}
