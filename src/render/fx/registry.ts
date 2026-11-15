// One entry per effect type. Types whose shaders are not built yet are skipped (`available: false`).
import { FX_TYPES } from '../../core/model';
import type { FxType } from '../../core/model';
import { colorFx } from './effects/color';
import { chromaFx } from './effects/chroma';
import { lookFx } from './effects/look';
import { lutFx } from './effects/lut';
import { glitchFx, grainFx, mirrorFx, rgbsplitFx, vhsFx } from './effects/stylise';
import { blurFx, glowFx, pixelateFx, sharpenFx } from './effects/spatial';
import { bwFx, invertFx, sepiaFx, vignetteFx } from './effects/simple';
import type { FxDef } from './types';

const pending = (type: FxType): FxDef => ({ type, available: false, run: (_rc, src) => src });

const BUILT: Partial<Record<FxType, FxDef>> = {
  color: colorFx,
  bw: bwFx,
  sepia: sepiaFx,
  invert: invertFx,
  vignette: vignetteFx,
  blur: blurFx,
  sharpen: sharpenFx,
  glow: glowFx,
  pixelate: pixelateFx,
  rgbsplit: rgbsplitFx,
  glitch: glitchFx,
  vhs: vhsFx,
  mirror: mirrorFx,
  grain: grainFx,
  chroma: chromaFx,
  lut: lutFx,
  look: lookFx,
};

export const EFFECT_DEFS = Object.fromEntries(FX_TYPES.map((t) => [t, BUILT[t] ?? pending(t)])) as Record<FxType, FxDef>;
