import { FORMATS } from './formats';
import type { FormatKey } from './formats';

export type Id = string;
export type TrackKind = 'video' | 'audio';

/** x, y in canvas px from center; rotation in degrees. */
export interface Transform {
  x: number;
  y: number;
  scale: number;
  rotation: number;
  opacity: number;
}

export type AudioEffectType =
  | 'eq' | 'highpass' | 'lowpass' | 'compressor' | 'reverb' | 'echo' | 'pitch' | 'denoise' | 'gain';

export const FX_TYPES = [
  'color', 'look', 'lut', 'bw', 'sepia', 'invert', 'vignette', 'grain', 'blur', 'sharpen', 'glow', 'pixelate',
  'rgbsplit', 'glitch', 'vhs', 'mirror', 'chroma',
] as const;
export type FxType = (typeof FX_TYPES)[number];

/** A visual effect on a clip. Params are numbers only (colour = packed 0xRRGGBB, select = index, bool = 0/1); `ref` is a LUT id. */
export interface VisualEffect {
  id: Id;
  type: FxType;
  enabled: boolean;
  params: Record<string, number>;
  ref?: Id;
}

export const OVERLAY_TYPES = ['lowerThird', 'subscribe', 'progress', 'sticker'] as const;
export type OverlayType = (typeof OVERLAY_TYPES)[number];

/** A generated graphic (clip kind 'overlay', mediaId ''). */
export interface OverlaySpec {
  type: OverlayType;
  text: string;
  subtext: string;
  params: Record<string, number>;
}

/** An imported `.cube` LUT kept in OPFS; `size` is the cube edge (2..65). */
export interface LutRef {
  id: Id;
  name: string;
  size: number;
  missing?: boolean;
}

/** `gain` is the Normalise result (param `gainDb`). */
export interface AudioEffect {
  id: Id;
  type: AudioEffectType;
  enabled: boolean;
  params: Record<string, number>;
}

/** Per-clip audio settings: fades in seconds, pan -1..1. */
export interface ClipAudio {
  fadeIn: number;
  fadeOut: number;
  pan: number;
  silent: boolean;
  effects: AudioEffect[];
}

/** Ducks this track by `amountDb` (<= 0) while the source track has sound. */
export interface TrackDuck {
  sourceTrackId: Id;
  amountDb: number;
  attack: number;
  release: number;
}

/** Times in seconds; duration = out - in. */
export interface Clip {
  id: Id;
  mediaId: Id;
  kind: 'video' | 'audio' | 'image' | 'overlay';
  start: number;
  in: number;
  out: number;
  transform: Transform;
  volume: number;
  fit: 'fit' | 'fill' | 'blur';
  audio: ClipAudio;
  /** Visual effect stack, bottom first. Always present; empty for audio clips. */
  fx: VisualEffect[];
  /** Only on overlay clips. */
  overlay?: OverlaySpec;
}

export interface Track {
  id: Id;
  kind: TrackKind;
  /** User label; empty means the UI derives one ("Video 2"). */
  name: string;
  hidden: boolean;
  muted: boolean;
  solo: boolean;
  locked: boolean;
  /** Track gain 0..2 (1 = unity). */
  volume: number;
  duck: TrackDuck | null;
  clips: Clip[];
}

export interface MediaRef {
  id: Id;
  name: string;
  kind: 'video' | 'audio' | 'image';
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  missing?: boolean;
}

export interface Project {
  version: 4;
  format: { width: number; height: number; fps: number };
  tracks: Track[];
  media: Record<Id, MediaRef>;
  /** Imported LUT library. */
  luts: Record<Id, LutRef>;
}

export function newId(): Id {
  return crypto.randomUUID();
}

export function defaultTransform(): Transform {
  return { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 };
}

export function defaultClipAudio(): ClipAudio {
  return { fadeIn: 0, fadeOut: 0, pan: 0, silent: false, effects: [] };
}

export function newTrack(kind: TrackKind, name = ''): Track {
  return { id: newId(), kind, name, hidden: false, muted: false, solo: false, locked: false, volume: 1, duck: null, clips: [] };
}

export function emptyProject(formatKey: FormatKey = 'youtube'): Project {
  return {
    version: 4,
    format: { ...FORMATS[formatKey], fps: 30 },
    tracks: [newTrack('video'), newTrack('audio')],
    media: {},
    luts: {},
  };
}

export function clipDuration(c: Clip): number {
  return c.out - c.in;
}

export function clipEnd(c: Clip): number {
  return c.start + clipDuration(c);
}
