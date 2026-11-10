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

/** Times in seconds; duration = out - in. */
export interface Clip {
  id: Id;
  mediaId: Id;
  kind: 'video' | 'audio' | 'image';
  start: number;
  in: number;
  out: number;
  transform: Transform;
  volume: number;
  fit: 'fit' | 'fill' | 'blur';
}

export interface Track {
  id: Id;
  kind: TrackKind;
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
  version: 1;
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

export function emptyProject(formatKey: FormatKey = 'youtube'): Project {
  return {
    version: 1,
    format: { ...FORMATS[formatKey], fps: 30 },
    tracks: [
      { id: newId(), kind: 'video', clips: [] },
      { id: newId(), kind: 'audio', clips: [] },
    ],
    media: {},
  };
}

export function clipDuration(c: Clip): number {
  return c.out - c.in;
}

export function clipEnd(c: Clip): number {
  return c.start + clipDuration(c);
}
