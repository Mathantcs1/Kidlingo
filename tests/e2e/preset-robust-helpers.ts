// The Plan 5B Task 10 project for the real-app robustness specs: the 5A animated stack (robust-helpers.ts) with every
// clip also carrying presets in several slots, key loops after short key spans, and curved (tangent) position paths
// with a spring ease and orient along the path. Times are whole frames at 30 fps.
import { newOverlayClip } from '../../src/core/overlays';
import { defaultParams } from '../../src/core/videoEffects';
import type { Clip, MediaRef, PositionKeyframe, Project } from '../../src/core/model';
import { adjustmentClip, imageClip, key } from './keyframe-helpers';
import { emphasis, loop, use } from './preset-helpers';
import { FORMAT, animate, layered } from './robust-helpers';

/** Gives every position key tangents (a smooth, curved path) and a spring ease on the first one. */
export function curved(c: Clip): Clip {
  const position: PositionKeyframe[] = c.keys!.position!.map((k, i) => ({
    ...k, in: { x: -140, y: 90 + 20 * i }, out: { x: 140, y: -90 - 20 * i },
    ...(i === 0 ? { ease: { kind: 'spring' as const, spring: { stiffness: 120, damping: 14, mass: 1 } } } : {}),
  }));
  return { ...c, keys: { ...c.keys, position, loops: { scale: { mode: 'repeat', count: null }, rotation: { mode: 'offset', count: 3 } }, orient: true } };
}

/**
 * Standard stack (clips from `start` for `len` s, 0.5..3.5): 'bg'; 'img' on v1 (SOURCED, in = 0.4, keys over local
 * 0.4..1.9 then looping); 'ov' on v2 (sticker overlay, sourceless, keys over 0..1.5 then looping); 'adj' on v3
 * (adjustment: opacity-only presets). Presets: In 0.5..0.9 and Out 3.1..3.5 (timeline), the emphasis windows lie
 * wholly between 1.0 and 1.8 s, so a cut at 2.0 s or a trim of the starts keeps every sampled frame at 1.2..2.9 s.
 * `scaleBound` gives the overlay Pop / Zoom (they raise its texture size, see below).
 */
export function presetStack(
  m: Record<'bg' | 'green' | 'split', MediaRef>, { start = 0.5, len = 3, bgLen = 6, scaleBound = false } = {},
): Project {
  const bg = imageClip(m.bg, { id: 'bg', transform: { x: 0, y: 0, scale: 10, rotation: 0, opacity: 1 } }, 0, bgLen);
  const img = curved(animate(imageClip(m.green, { id: 'img', in: 0.4, out: 0.4 + len }, start), 0.4, 1.5));
  img.motion = {
    in: use('slide', 'in', { duration: 0.4 }), emphasis: emphasis('pulse', 1.2, { duration: 0.4 }),
    loop: loop('breathe', { duration: 1 }), out: use('fade', 'out', { duration: 0.4 }),
  };
  const ov = curved(animate({ ...newOverlayClip('sticker', start, len, FORMAT), id: 'ov' }, 0, 1.5, false));
  // The overlay's texture is sized by its largest drawn scale (maxDrawnScale): scale presets on only one half of a split
  // change that size, and with it the edge texels (no mipmaps), so the default overlay uses scale-neutral presets.
  ov.motion = {
    in: scaleBound ? use('pop', 'in', { duration: 0.4 }) : use('slide', 'in', { duration: 0.4 }), emphasis: emphasis('wobble', 0.5, { duration: 0.8 }),
    loop: loop('float', { duration: 1.5 }), out: scaleBound ? use('zoom', 'out', { duration: 0.4 }) : use('fade', 'out', { duration: 0.4 }),
  };
  const adj: Clip = {
    ...adjustmentClip({
      id: 'adj', start, in: 0, out: len, keys: { opacity: [key(0, 0.2, 'easeIn'), key(len, 0.7)] },
      effects: [{ id: 'adj-invert', type: 'invert', enabled: true, params: defaultParams('invert'), keys: { amount: [key(0, 0.1), key(len / 2, 0.6, 'easeOut'), key(len, 0.3)] } }],
    }),
    motion: { in: use('fade', 'in', { duration: 0.3 }), loop: loop('blink', { duration: 1 }), out: use('fade', 'out', { duration: 0.3 }) },
  };
  return layered([[bg], [img], [ov], [adj]], Object.values(m));
}
