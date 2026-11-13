// The Task 11 heavy project (harness): 10 s at 1920×1080/30 fps, a static background and 8 clips with position,
// scale, rotation and opacity keyed (assorted eases) plus two effects with a keyed param each; and its static twin.
import type { Page } from '@playwright/test';
import { resolveClip } from '../../src/core/animate';
import { defaultParams } from '../../src/core/videoEffects';
import type { EaseKind } from '../../src/core/easing';
import type { Clip, MediaRef, Project, VideoEffect, VideoEffectType } from '../../src/core/model';
import { imageClip, key, pos, solid, stack } from './keyframe-helpers';

export const LEN = 10;
/** Two keyed effects per clip: [type, keyed param, from, to]. No keyed blur radius: the pass count stays per frame. */
const PAIRS: [VideoEffectType, string, number, number][][] = [
  [['colour', 'brightness', -0.4, 0.4], ['vignette', 'amount', 0, 0.9]],
  [['sepia', 'amount', 0, 1], ['rgbSplit', 'amount', 0, 20]],
  [['bw', 'amount', 1, 0], ['pixelate', 'size', 1, 24]],
  [['invert', 'amount', 0, 1], ['splitTone', 'balance', -1, 1]],
  [['colour', 'hue', -180, 180], ['sharpen', 'amount', 0, 2]],
  [['vignette', 'size', 0.1, 0.9], ['colour', 'saturation', -1, 1]],
  [['glow', 'intensity', 0, 2], ['bw', 'amount', 0, 1]],
  [['sharpen', 'radius', 0.5, 5], ['colour', 'contrast', 0.5, -0.5]],
];
const EASES: EaseKind[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'back', 'elastic', 'bounce', 'hold'];

export function animatedClip(m: MediaRef, i: number): Clip {
  const e = (j: number): EaseKind => EASES[(i + j) % EASES.length];
  const cx = ((i % 4) - 1.5) * 440;
  const cy = (Math.floor(i / 4) - 0.5) * 480;
  const effects: VideoEffect[] = PAIRS[i].map(([type, param, a, b], j) => ({
    id: `fx-${i}-${j}`, type, enabled: true, params: defaultParams(type),
    keys: { [param]: [key(0, a, e(j)), key(LEN / 2, b, e(j + 1)), key(LEN, a)] },
  }));
  return imageClip(m, {
    id: `clip-${i}`, effects,
    keys: {
      position: [pos(0, cx - 200, cy, e(2)), pos(4, cx + 200, cy + 100, e(3)), pos(LEN, cx, cy - 100)],
      scale: [key(0, 0.4, e(4)), key(5, 0.8, e(5)), key(LEN, 0.5)],
      rotation: [key(0, -45, e(6)), key(LEN, 315)],
      opacity: [key(0, 0.3, e(7)), key(3, 1, e(0)), key(LEN, 0.6)],
    },
  }, 0, LEN);
}

/** The background plus the 8 animated clips (`count` of them), each on its own layer. */
export async function eightClips(page: Page, count = 8, extra: Clip[] = []): Promise<Project> {
  const bg = await solid(page, 192, 108, [30, 40, 60]);
  const m = await solid(page, 640, 360, [200, 90, 40], { right: [40, 150, 210], bottom: [230, 220, 200] });
  return stack({ width: 1920, height: 1080, fps: 30 }, [
    [imageClip(bg, { id: 'bg', transform: { x: 0, y: 0, scale: 10, rotation: 0, opacity: 1 } }, 0, LEN)],
    ...Array.from({ length: count }, (_, i) => [animatedClip(m, i)]),
    ...extra.map((c) => [c]),
  ], [bg, m]);
}

/** The same project with every clip frozen at its resolved state at `t` (no keys): the same draws, no evaluation. */
export function frozen(p: Project, t: number): Project {
  return { ...p, tracks: p.tracks.map((tr) => ({ ...tr, clips: tr.clips.map((c) => resolveClip(c, t, p.format)) })) };
}
