// Repairs a clip's picture effect stack and blend mode when a saved project is opened (data v4).
import { newId } from './model';
import type { BlendMode, VideoEffect } from './model';
import { BLEND_MODES, MAX_VIDEO_EFFECTS, clampParams, isVideoEffectType } from './videoEffects';

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function toVideoEffect(raw: unknown): VideoEffect | null {
  if (!isObject(raw) || typeof raw.id !== 'string' || !isVideoEffectType(raw.type)) return null;
  const params: Record<string, number> = {};
  for (const [k, v] of Object.entries(isObject(raw.params) ? raw.params : {})) if (typeof v === 'number' && Number.isFinite(v)) params[k] = v;
  const { ref, ...rest } = raw;
  const base = { ...rest, id: raw.id, type: raw.type, enabled: raw.enabled !== false, params: clampParams(raw.type, params) };
  if (raw.type !== 'lut') return base;
  return typeof ref === 'string' && ref !== '' ? { ...base, ref } : null;
}

/** Later effects that reuse an id get a new one (the first keeps it), so ids stay unique within a clip. */
function uniqueIds(list: VideoEffect[]): VideoEffect[] {
  const seen = new Set<string>();
  return list.map((e) => {
    const id = seen.has(e.id) ? newId() : e.id;
    seen.add(id);
    return id === e.id ? e : { ...e, id };
  });
}

/** Audio clips never carry picture effects. Invalid effects are dropped, the stack is capped at 8. */
export function toClipEffects(raw: unknown, isAudio: boolean): VideoEffect[] {
  if (isAudio || !Array.isArray(raw)) return [];
  const valid = raw.map(toVideoEffect).filter((e): e is VideoEffect => e !== null);
  return uniqueIds(valid.slice(0, MAX_VIDEO_EFFECTS));
}

export function toBlend(raw: unknown, isAudio: boolean): BlendMode {
  return !isAudio && BLEND_MODES.includes(raw as BlendMode) ? (raw as BlendMode) : 'normal';
}
