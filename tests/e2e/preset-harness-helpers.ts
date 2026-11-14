// The Plan 5B Task 10 heavy project (harness): 10 s at 1920x1080 / 30 fps, a static background and 8 clips, each with
// position (curved, spring-eased first segment), scale, rotation and opacity keys over the first 5 s that then LOOP
// (scale and opacity repeat, rotation continues), orient along the path, a keyed effect param that repeats, and FOUR
// presets (In, Emphasis, Loop, Out). Plus its frozen twin (see robust-harness-helpers `frozen`).
import type { Page } from '@playwright/test';
import type { Clip, Keyframe, Project } from '../../src/core/model';
import type { PresetKey } from '../../src/core/motionTypes';
import { emphasis, loop, use } from './preset-helpers';
import { eightClips, LEN } from './robust-harness-helpers';
import { curved } from './preset-robust-helpers';

const IN: PresetKey[] = ['fade', 'slide', 'zoom', 'pop', 'spin', 'drop', 'whip', 'rise'];
const EMPHASIS: PresetKey[] = ['pulse', 'shake', 'wobble', 'hop', 'spin360', 'flash', 'pulse', 'wobble'];
const LOOP: PresetKey[] = ['breathe', 'float', 'spinLoop', 'jitter', 'blink', 'kenBurns', 'breathe', 'float'];
const OUT: PresetKey[] = ['fade', 'zoom', 'slide', 'rise', 'spin', 'drop', 'whip', 'pop'];

const half = (list: Keyframe[]): Keyframe[] => list.map((k) => ({ ...k, t: k.t / 2 }));

/** `clip` with its transform keys squeezed into the first half (so the loops engage), curved and carrying 4 presets. */
export function presetClip(clip: Clip, i: number): Clip {
  const k = clip.keys!;
  const squeezed: Clip = {
    ...clip,
    keys: { ...k, position: k.position!.map((p) => ({ ...p, t: p.t / 2 })), scale: half(k.scale!), rotation: half(k.rotation!), opacity: half(k.opacity!) },
    effects: clip.effects.map((e, j) => {
      const [param, list] = Object.entries(e.keys!)[0];
      return j === 0 ? { ...e, loops: { [param]: { mode: 'repeat' as const, count: null } } } : { ...e, keys: { [param]: list } };
    }),
  };
  const c = curved(squeezed);
  return {
    ...c,
    keys: { ...c.keys, loops: { scale: { mode: 'repeat', count: null }, opacity: { mode: 'pingPong', count: null }, rotation: { mode: 'offset', count: null } } },
    motion: {
      in: use(IN[i], 'in'), emphasis: emphasis(EMPHASIS[i], 3 + 0.4 * i), loop: loop(LOOP[i]), out: use(OUT[i], 'out'),
    },
  };
}

/** The background plus the 8 preset clips (`count` of them) and `extra` clips on their own layers. */
export async function eightPresetClips(page: Page, count = 8, extra: Clip[] = []): Promise<Project> {
  const p = await eightClips(page, count, extra);
  return { ...p, tracks: p.tracks.map((t) => (t.clips[0]?.id.startsWith('clip-') ? { ...t, clips: t.clips.map((c) => presetClip(c, Number(c.id.slice(5)))) } : t)) };
}

export { LEN };
