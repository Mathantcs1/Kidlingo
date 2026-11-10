// DOM-free helpers for the export dialog.

export const DEFAULT_EXPORT_NAME = 'clipforge-export';
/** Longest base name kept, in user-perceived characters (grapheme clusters). */
const MAX_BASE = 100;
/** Characters no common file system accepts in a name, plus control characters. */
const UNSAFE = /[\\/:*?"<>|\p{Cc}]+/gu;
/** Windows device names, reserved with or without an extension. */
const RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;
const EDGES = /^[\s.-]+|[\s.-]+$/gu;

/** The first `max` grapheme clusters of `s` (falls back to code points without Intl.Segmenter). */
function cut(s: string, max: number): string {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const parts = [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(s)];
    return parts.length <= max ? s : parts.slice(0, max).map((p) => p.segment).join('');
  }
  return Array.from(s).slice(0, max).join('');
}

/**
 * A safe download name ending in a single `.mp4`. Keeps Unicode letters and emoji; replaces path separators,
 * `: * ? " < > |` and control characters with '-', collapses whitespace, drops leading dots and trailing
 * dots, spaces and dashes, avoids Windows device names (CON, NUL, COM1…), caps the length and falls back to the default
 * name when nothing usable is left.
 */
export function safeFilename(name: string): string {
  let base = name.replace(UNSAFE, '-').replace(/\s+/gu, ' ').replace(/-{2,}/g, '-').trim();
  for (let prev = ''; prev !== base; ) {
    prev = base;
    if (/\.mp4$/i.test(base)) base = base.slice(0, -4).trim();
    else base = base.replace(EDGES, '');
  }
  base = cut(base, MAX_BASE).replace(EDGES, '');
  if (!base) return `${DEFAULT_EXPORT_NAME}.mp4`;
  const dot = base.indexOf('.');
  const stem = dot < 0 ? base : base.slice(0, dot);
  if (RESERVED.test(stem)) base = `${stem}_${base.slice(stem.length)}`;
  return `${base}.mp4`;
}

/** A progress fraction as a whole percentage, clamped to 0–100%. */
export function percent(frac: number): string {
  const f = Number.isNaN(frac) ? 0 : Math.min(1, Math.max(0, frac));
  return `${Math.round(f * 100)}%`;
}
