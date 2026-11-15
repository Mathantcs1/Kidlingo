// DOM-free types for the visual effect registry (schemas live in params.ts, shaders in src/render/fx).
import type { FxType } from '../core/model';

export type FxParamKind = 'number' | 'color' | 'select' | 'bool';

/** One numeric parameter. Colours are packed 0xRRGGBB, selects an option index, bools 0/1 (all stored as numbers). */
export interface FxParamDef {
  key: string;
  label: string;
  kind: FxParamKind;
  min: number;
  max: number;
  step: number;
  def: number;
  /** Shown after the value, e.g. 'px', '°', 'stops'. Pixel units are SOURCE pixels (Plan 4 E2). */
  unit?: string;
  /** Labels for `select` params. */
  options?: string[];
}

export type FxGroup = 'Colour' | 'Looks' | 'Blur & sharpen' | 'Stylise' | 'Key';

export interface FxSchema {
  type: FxType;
  label: string;
  group: FxGroup;
  params: FxParamDef[];
  /** Output depends on the clip's time (grain, glitch, VHS): seeded per frame so preview and export agree (E6). */
  timeDriven: boolean;
  /** The effect reads a LUT from the project library (`VisualEffect.ref`). */
  needsLut?: true;
}
