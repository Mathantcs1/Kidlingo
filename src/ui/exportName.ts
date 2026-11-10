// DOM-free helpers for the export dialog.

export const DEFAULT_EXPORT_NAME = 'clipforge-export';
const MAX_BASE = 100;

/** A safe download name ending in a single `.mp4`: unsafe characters become '-', empty names get the default. */
export function safeFilename(name: string): string {
  let base = name.trim();
  while (/\.mp4$/i.test(base)) base = base.slice(0, -4).trim();
  base = base
    .replace(/[^A-Za-z0-9 _.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[\s.-]+|[\s.-]+$/g, '')
    .slice(0, MAX_BASE)
    .trim();
  return `${base || DEFAULT_EXPORT_NAME}.mp4`;
}

/** A progress fraction as a whole percentage, clamped to 0–100%. */
export function percent(frac: number): string {
  const f = Number.isNaN(frac) ? 0 : Math.min(1, Math.max(0, frac));
  return `${Math.round(f * 100)}%`;
}
