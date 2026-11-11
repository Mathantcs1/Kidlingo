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

/** `gain` is the Normalise result (param `gainDb`). */
export interface AudioEffect {
  id: Id;
  type: AudioEffectType;
  enabled: boolean;
  params: Record<string, number>;
}

export type VideoEffectType =
  | 'colour' | 'bw' | 'sepia' | 'splitTone' | 'vignette' | 'grain' | 'lut' | 'blur' | 'sharpen' | 'glow' | 'pixelate'
  | 'rgbSplit' | 'glitch' | 'vhs' | 'mirror' | 'invert' | 'chromaKey';

/** One entry of a clip's picture effect stack. `ref` is the LUT media id (`lut` only). */
export interface VideoEffect {
  id: Id;
  type: VideoEffectType;
  enabled: boolean;
  params: Record<string, number>;
  ref?: Id;
}

export type BlendMode =
  | 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten' | 'colourDodge' | 'colourBurn'
  | 'hardLight' | 'softLight' | 'difference' | 'exclusion';

export type OverlayType = 'lowerThird' | 'subscribe' | 'progressBar' | 'sticker';
export type StickerKind = 'heart' | 'star' | 'arrow' | 'like' | 'bell' | 'fire' | 'check' | 'sparkle';

/** What an overlay clip draws (data v5). Colours are `#rrggbb`; `sticker` is set on sticker overlays only. */
export interface OverlaySpec {
  type: OverlayType;
  text: string;
  subtext: string;
  colour: string;
  accent: string;
  sticker?: StickerKind;
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
  /**
   * `overlay` clips (data v5) draw `overlay`; `adjustment` clips (data v5) apply their effects, blend mode and opacity
   * to everything drawn below them, full frame. Neither has media: `mediaId` is '' and is never looked up.
   */
  kind: 'video' | 'audio' | 'image' | 'overlay' | 'adjustment';
  start: number;
  in: number;
  out: number;
  transform: Transform;
  volume: number;
  fit: 'fit' | 'fill' | 'blur';
  audio: ClipAudio;
  /** Picture effects, applied in order (video, image and adjustment clips; always [] on audio clips). Max 8. */
  effects: VideoEffect[];
  blend: BlendMode;
  /** Overlay clips only (always `effects: []`, `blend: 'normal'`, `fit: 'fit'`). */
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
  /** `lut` media (a .cube file) is never placed on the timeline: effects reference it by id. */
  kind: 'video' | 'audio' | 'image' | 'lut';
  duration: number;
  width?: number;
  height?: number;
  fps?: number;
  hasAudio: boolean;
  missing?: boolean;
  /** `lut` media: the imported file's own name (`name` is the LUT's TITLE when it has one). */
  fileName?: string;
}

export interface Project {
  version: 5;
  format: { width: number; height: number; fps: number };
  tracks: Track[];
  media: Record<Id, MediaRef>;
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
    version: 5,
    format: { ...FORMATS[formatKey], fps: 30 },
    tracks: [newTrack('video'), newTrack('audio')],
    media: {},
  };
}

/** Overlay and adjustment clips: no media, no source (`in` is unused, the start can be trimmed either way). */
export function isSourceless(c: Clip): boolean {
  return c.kind === 'overlay' || c.kind === 'adjustment';
}

export function clipDuration(c: Clip): number {
  return c.out - c.in;
}

export function clipEnd(c: Clip): number {
  return c.start + clipDuration(c);
}
