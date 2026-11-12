// Shared fixtures for the keyframe edit and clip-operation tests (Plan 5 Task 4).
import type { Ease } from '../src/core/easing';
import { defaultClipAudio } from '../src/core/model';
import { defaultParams } from '../src/core/videoEffects';
import type { Clip, Keyframe, PositionKeyframe, Project, VideoEffect } from '../src/core/model';
import { CURRENT_VERSION } from './helpers/project';

export const lin: Ease = { kind: 'linear' };
export const k = (t: number, v: number, ease: Ease = lin): Keyframe => ({ t, v, ease });
export const pk = (t: number, x: number, y: number, ease: Ease = lin): PositionKeyframe => ({ t, x, y, ease });

export const colourFx = (id = 'fx', over: Partial<VideoEffect> = {}): VideoEffect =>
  ({ id, type: 'colour', enabled: true, params: defaultParams('colour'), ...over });
export const mirrorFx = (id = 'mr'): VideoEffect => ({ id, type: 'mirror', enabled: true, params: { mode: 1 } });

export const mk = (id: string, over: Partial<Clip> = {}): Clip => ({
  id, mediaId: 'm1', kind: 'video', start: 10, in: 2, out: 6, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  volume: 1, fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal', ...over,
});

const track = (id: string, kind: 'video' | 'audio', clips: Clip[], locked = false) => ({
  id, kind, name: '', hidden: false, muted: false, solo: false, locked, volume: 1, duck: null, clips,
});

/**
 * Format 1920×1080 @ 30 fps. Track 'v': video 'c' (10..14 s, in 2, effects colour 'fx' + mirror 'mr'), overlay 'o'
 * (20..24 s), adjustment 'adj' (30..34 s). Track 'L' (locked): video 'lc'. Track 'a': audio 'ac'. Media 'm1' 1920×1080.
 */
export function project(c: Partial<Clip> = {}): Project {
  return {
    version: CURRENT_VERSION,
    format: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      track('v', 'video', [
        mk('c', { effects: [colourFx(), mirrorFx()], ...c }),
        mk('o', { kind: 'overlay', mediaId: '', start: 20, in: 0, out: 4, overlay: { type: 'sticker', text: '', subtext: '', colour: '#ffffff', accent: '#ff0000', sticker: 'star' } }),
        mk('adj', { kind: 'adjustment', mediaId: '', start: 30, in: 0, out: 4, effects: [colourFx('fa')] }),
      ]),
      track('L', 'video', [mk('lc')], true),
      track('a', 'audio', [mk('ac', { kind: 'audio' })]),
    ],
    media: { m1: { id: 'm1', name: 'a.mp4', kind: 'video', duration: 20, width: 1920, height: 1080, fps: 30, hasAudio: true } },
  };
}

export const clipOf = (p: Project, id: string): Clip => {
  for (const t of p.tracks) for (const c of t.clips) if (c.id === id) return c;
  throw new Error(`no clip ${id}`);
};

/** mulberry32: a seeded generator so the property tests are reproducible. */
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const EASES: Ease[] = [
  lin, { kind: 'hold' }, { kind: 'easeIn' }, { kind: 'easeOut' }, { kind: 'easeInOut' }, { kind: 'back' }, { kind: 'elastic' },
  { kind: 'bounce' }, { kind: 'bezier', bezier: [0.2, -0.6, 0.7, 1.8] },
];
export const randomEase = (r: () => number): Ease => EASES[Math.floor(r() * EASES.length)];

/** A sorted random key list (times spread over [lo, hi], at least 0.01 s apart) of 1..8 keys. */
export function randomTimes(r: () => number, lo: number, hi: number): number[] {
  const n = 1 + Math.floor(r() * 8);
  const ts = new Set<number>();
  while (ts.size < n) ts.add(Math.round((lo + r() * (hi - lo)) * 100) / 100 + 0.003);
  return [...ts].sort((a, b) => a - b);
}
