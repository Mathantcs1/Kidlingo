// What an overlay clip draws (data v5): the types, their defaults, and the per-field repair of a saved spec. Pure.
import type { OverlaySpec, OverlayType, StickerKind } from './model';

export const OVERLAY_TYPES: readonly OverlayType[] = ['lowerThird', 'subscribe', 'progressBar', 'sticker'];
export const STICKER_KINDS: readonly StickerKind[] = ['heart', 'star', 'arrow', 'like', 'bell', 'fire', 'check', 'sparkle'];

export const OVERLAY_LABELS: Record<OverlayType, string> = {
  lowerThird: 'Lower third',
  subscribe: 'Subscribe button',
  progressBar: 'Progress bar',
  sticker: 'Sticker',
};

export const STICKER_LABELS: Record<StickerKind, string> = {
  heart: 'Heart', star: 'Star', arrow: 'Arrow', like: 'Like', bell: 'Bell', fire: 'Fire', check: 'Check', sparkle: 'Sparkle',
};

/** Longest overlay text or subtext, in code points (longer text is cut). */
export const MAX_OVERLAY_TEXT = 80;

/** Seconds an overlay added without a duration lasts. */
export const DEFAULT_OVERLAY_DURATION = 5;

const DEFAULTS: Record<OverlayType, Omit<OverlaySpec, 'type'>> = {
  lowerThird: { text: 'Your Name', subtext: 'Title or role', colour: '#14141f', accent: '#ffcc00' },
  subscribe: { text: 'SUBSCRIBE', subtext: '', colour: '#e01b24', accent: '#ffffff' },
  progressBar: { text: '', subtext: '', colour: '#3a3a3a', accent: '#e01b24' },
  sticker: { text: '', subtext: '', colour: '#ff3b5c', accent: '#ffffff', sticker: 'heart' },
};

export const isOverlayType = (v: unknown): v is OverlayType => OVERLAY_TYPES.includes(v as OverlayType);
export const isStickerKind = (v: unknown): v is StickerKind => STICKER_KINDS.includes(v as StickerKind);

/** `#rrggbb` (any case) → lowercase; anything else → null. */
export function hexColour(v: unknown): string | null {
  return typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v.toLowerCase() : null;
}

/** Cut to MAX_OVERLAY_TEXT code points (never splitting an emoji). */
export const cutText = (s: string): string => Array.from(s).slice(0, MAX_OVERLAY_TEXT).join('');

/** A fresh default spec for `type`. */
export function overlayDefaults(type: OverlayType): OverlaySpec {
  return { type, ...DEFAULTS[type] };
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Repairs a saved spec per field (wrong text → default, too long → cut, bad colour → default, missing/unknown
 * sticker → default; `sticker` is removed from non-sticker types; unknown extra keys are kept). Null when the spec is
 * not an object or its type is unknown: such a clip cannot be drawn and is dropped by the migration.
 */
export function toOverlaySpec(raw: unknown): OverlaySpec | null {
  if (!isObject(raw) || !isOverlayType(raw.type)) return null;
  const d = overlayDefaults(raw.type);
  const { sticker, ...rest } = raw;
  const spec: OverlaySpec = {
    ...rest,
    type: raw.type,
    text: typeof raw.text === 'string' ? cutText(raw.text) : d.text,
    subtext: typeof raw.subtext === 'string' ? cutText(raw.subtext) : d.subtext,
    colour: hexColour(raw.colour) ?? d.colour,
    accent: hexColour(raw.accent) ?? d.accent,
  };
  if (raw.type === 'sticker') spec.sticker = isStickerKind(sticker) ? sticker : d.sticker;
  return spec;
}
