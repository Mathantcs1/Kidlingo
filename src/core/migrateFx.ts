// Per-field repair of the v4 additions (clip effects, overlay specs, the LUT library). Never rejects a project.
import { FX_TYPES, OVERLAY_TYPES, newId } from './model';
import type { FxType, LutRef, OverlaySpec, OverlayType, VisualEffect } from './model';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const MAX_TEXT = 200;

function finiteParams(raw: Record<string, unknown>): Record<string, number> {
  const params: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
  return params;
}

function toFx(raw: unknown): VisualEffect | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !FX_TYPES.includes(raw.type as FxType)) return null;
  if (typeof raw.enabled !== 'boolean' || !isObject(raw.params)) return null;
  const fx: VisualEffect = { ...raw, id: raw.id, type: raw.type as FxType, enabled: raw.enabled, params: finiteParams(raw.params) };
  if (typeof raw.ref !== 'string') delete fx.ref;
  return fx;
}

/** Valid effects only; a later effect that reuses an id gets a new one (the first keeps it). */
export function toFxList(raw: unknown): VisualEffect[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: VisualEffect[] = [];
  for (const item of raw) {
    const fx = toFx(item);
    if (!fx) continue;
    if (seen.has(fx.id)) fx.id = newId();
    seen.add(fx.id);
    out.push(fx);
  }
  return out;
}

export const defaultOverlaySpec = (): OverlaySpec => ({ type: 'lowerThird', text: '', subtext: '', params: {} });

/** A clip of kind 'overlay' always keeps a spec (a missing/invalid one becomes a default lower third). */
export function toOverlay(raw: unknown): OverlaySpec {
  if (!isObject(raw) || !OVERLAY_TYPES.includes(raw.type as OverlayType)) return defaultOverlaySpec();
  return {
    ...raw,
    type: raw.type as OverlayType,
    text: typeof raw.text === 'string' ? raw.text.slice(0, MAX_TEXT) : '',
    subtext: typeof raw.subtext === 'string' ? raw.subtext.slice(0, MAX_TEXT) : '',
    params: isObject(raw.params) ? finiteParams(raw.params) : {},
  };
}

export function toLuts(raw: unknown): Record<string, LutRef> {
  const out: Record<string, LutRef> = {};
  if (!isObject(raw)) return out;
  for (const [key, v] of Object.entries(raw)) {
    if (!isObject(v) || typeof v.id !== 'string' || typeof v.name !== 'string') continue;
    if (typeof v.size !== 'number' || !Number.isInteger(v.size) || v.size < 2 || v.size > 65) continue;
    const lut: LutRef = { ...v, id: v.id, name: v.name, size: v.size };
    if (v.missing !== true) delete lut.missing;
    else lut.missing = true;
    out[key] = lut;
  }
  return out;
}
