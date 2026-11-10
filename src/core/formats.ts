export type FormatKey = 'youtube' | 'vertical' | 'square' | 'portrait';

export const FORMATS: Record<FormatKey, { width: number; height: number }> = {
  youtube: { width: 1920, height: 1080 },
  vertical: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
  portrait: { width: 1080, height: 1350 },
};
