// One entry per effect type. Types whose shaders are not built yet are skipped (`available: false`).
import { FX_TYPES } from '../../core/model';
import type { FxType } from '../../core/model';
import { colorFx } from './effects/color';
import { bwFx, invertFx, sepiaFx, vignetteFx } from './effects/simple';
import type { FxDef } from './types';

const pending = (type: FxType): FxDef => ({ type, available: false, run: (_rc, src) => src });

const BUILT: Partial<Record<FxType, FxDef>> = {
  color: colorFx,
  bw: bwFx,
  sepia: sepiaFx,
  invert: invertFx,
  vignette: vignetteFx,
};

export const EFFECT_DEFS = Object.fromEntries(FX_TYPES.map((t) => [t, BUILT[t] ?? pending(t)])) as Record<FxType, FxDef>;
