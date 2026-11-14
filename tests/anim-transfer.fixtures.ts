// Fixtures for the animation transfer tests (Plan 5B Task 9): a 1920×1080 @ 30 fps project with a 3840×2160 photo
// (fill scale 0.5), a 1920×1080 video (fill scale 1), an overlay, an adjustment layer and an audio clip.
import { defaultClipAudio, defaultTransform } from '../src/core/model';
import type { Clip, Keyframe, PositionKeyframe, Project, Track, VideoEffect } from '../src/core/model';
import type { Ease } from '../src/core/easing';
import { presetEase, presetParams } from '../src/core/presets';
import type { EmphasisUse, PresetKey, PresetUse } from '../src/core/motionTypes';
import { newOverlayClip } from '../src/core/overlays';
import { CURRENT_VERSION } from './helpers/project';

export const lin: Ease = { kind: 'linear' };
export const k = (t: number, v: number, ease: Ease = lin): Keyframe => ({ t, v, ease });
export const pk = (t: number, x: number, y: number, extra: Partial<PositionKeyframe> = {}): PositionKeyframe => ({ t, x, y, ease: lin, ...extra });

export const colour = (id: string, keys?: Record<string, Keyframe[]>): VideoEffect =>
  ({ id, type: 'colour', enabled: true, params: { brightness: 0, contrast: 1, saturation: 1 }, ...(keys ? { keys } : {}) });
export const blur = (id: string): VideoEffect => ({ id, type: 'blur', enabled: true, params: { radius: 4 } });

export const clip = (id: string, over: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'video', kind: 'video', start: 0, in: 0, out: 4, transform: defaultTransform(), volume: 1, fit: 'fill',
  audio: defaultClipAudio(), effects: [], blend: 'normal', ...over,
});

export const useOf = (key: PresetKey, slot: 'in' | 'out' | 'loop', duration = 0.5): PresetUse =>
  ({ preset: key, duration, delay: 0, ease: presetEase(key, slot), params: presetParams(key, slot) });
export const emphasisOf = (key: PresetKey, at: number): EmphasisUse =>
  ({ preset: key, duration: 0.5, delay: 0, ease: presetEase(key, 'emphasis'), params: presetParams(key, 'emphasis'), at });

const track = (id: string, kind: Track['kind'], clips: Clip[], locked = false): Track =>
  ({ id, kind, name: '', hidden: false, muted: false, solo: false, locked, volume: 1, duck: null, clips });

/** Tracks v1 (video 'V' and photo 'P'), v2 (overlay 'O', adjustment 'J'), L (locked video 'LC'), a1 (audio 'AU'). */
export function project(over: { V?: Partial<Clip>; P?: Partial<Clip>; O?: Partial<Clip> } = {}): Project {
  const format = { width: 1920, height: 1080, fps: 30 };
  const O = { ...newOverlayClip('sticker', 0, 4, format), id: 'O', ...over.O };
  const J = { ...clip('J', { kind: 'adjustment', mediaId: '', effects: [colour('jc')] }) };
  return {
    version: CURRENT_VERSION,
    format,
    tracks: [
      track('v1', 'video', [clip('V', over.V), clip('P', { mediaId: 'photo', kind: 'image', start: 10, ...over.P })]),
      track('v2', 'video', [O, { ...J, start: 10 }]),
      track('L', 'video', [clip('LC', { start: 20 })], true),
      track('a1', 'audio', [clip('AU', { kind: 'audio', mediaId: 'audio' })]),
    ],
    media: {
      video: { id: 'video', name: 'v.mp4', kind: 'video', duration: 20, width: 1920, height: 1080, fps: 30, hasAudio: true },
      photo: { id: 'photo', name: 'p.png', kind: 'image', duration: 5, width: 3840, height: 2160, hasAudio: false },
      audio: { id: 'audio', name: 'a.wav', kind: 'audio', duration: 20, hasAudio: true },
    },
  };
}

export const clipOf = (p: Project, id: string): Clip => {
  for (const t of p.tracks) for (const c of t.clips) if (c.id === id) return c;
  throw new Error(`no clip ${id}`);
};
