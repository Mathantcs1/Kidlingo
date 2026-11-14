// Animation transfer payloads (Plan 5B D8): a deep, project-independent snapshot of selected keys or of a clip's whole
// animation (keys, loops, orient, effect keys and the preset stack). Times are RELATIVE (to the earliest copied key, or
// to the clip's visible start), effects are matched by TYPE and OCCURRENCE, scale keys are adapted by the fit-scale
// ratio of the destination (size adaptation). Pure.
import { targetKeys } from './animTargets';
import type { KeyRef, TransformProp } from './animTargets';
import { copyKey } from './keyLists';
import type { AnyKey } from './keyLists';
import { localRange, tooClose } from './keyframes';
import { fitTransform } from './merge';
import type { Clip, Id, KeyLoop, Project, VideoEffectType } from './model';
import type { ClipMotion } from './motionTypes';
import { overlayBaseSize } from './overlays';
import { TimelineError, findClip } from './timeline';

/** A copied target: a transform property, or a param of the `occurrence`-th effect of `type` (0 = the first colour effect). */
export type PayloadTarget =
  | { kind: 'transform'; prop: TransformProp }
  | { kind: 'effect'; type: VideoEffectType; occurrence: number; param: string };

export interface KeysPayload {
  kind: 'keys';
  sourceKind: Clip['kind'];
  /** The source clip's fit scale (for the size adaptation of scale keys). */
  fit: number;
  targets: { target: PayloadTarget; keys: AnyKey[] }[];
}

export interface EffectAnim {
  type: VideoEffectType;
  occurrence: number;
  keys: Record<string, AnyKey[]>;
  loops?: Record<string, KeyLoop>;
}

export interface AnimPayload {
  kind: 'anim';
  sourceKind: Clip['kind'];
  fit: number;
  /** The source's visible local start; `span` its visible duration. Key times and the emphasis `at` are stored relative to `lo`; the loop `phase` is raw. */
  lo: number;
  span: number;
  keys?: { position?: AnyKey[]; scale?: AnyKey[]; rotation?: AnyKey[]; opacity?: AnyKey[]; loops?: Record<string, KeyLoop>; orient?: true };
  effects: EffectAnim[];
  motion?: ClipMotion;
  /** User presets: position keys are offsets from the first position key (applied relative to the destination's rest). */
  positionRelative?: true;
}

/**
 * The scale at which the clip's media (or, for overlays, its base box) spans the canvas: the unit of "zoom relative to
 * the frame". Videos and images: fitTransform; overlays: the format width over the base width of their type; others and
 * media of unknown size: 1. Scale keys move between clips as keys × fitScale(destination) / fitScale(source).
 */
export function fitScale(p: Project, clip: Clip): number {
  if (clip.kind === 'overlay' && clip.overlay) return p.format.width / overlayBaseSize(clip.overlay.type, p.format).width;
  if (clip.kind !== 'video' && clip.kind !== 'image') return 1;
  const m = p.media[clip.mediaId];
  if (!m?.width || !m.height) return 1;
  const s = fitTransform({ width: m.width, height: m.height }, p.format, clip.fit).scale;
  return Number.isFinite(s) && s > 0 ? s : 1;
}

/** Destination over source fit scale (1 when either is unusable). */
export const fitRatio = (dest: number, src: number): number => {
  const r = dest / src;
  return Number.isFinite(r) && r > 0 ? r : 1;
};

const copyList = (l: readonly AnyKey[], d: number): AnyKey[] => l.map((k) => ({ ...copyKey(k), t: k.t - d }));
const copyLoops = (loops: Record<string, KeyLoop>): Record<string, KeyLoop> =>
  Object.fromEntries(Object.entries(loops).map(([k, l]) => [k, { mode: l.mode, count: l.count }]));

/** The occurrence index of effect `id` among the clip's effects of its type. */
function occurrenceOf(clip: Clip, id: Id): { type: VideoEffectType; occurrence: number } | null {
  const e = clip.effects.find((x) => x.id === id);
  if (!e) return null;
  return { type: e.type, occurrence: clip.effects.filter((x) => x.type === e.type).indexOf(e) };
}

/** The keys at `refs` (every target at the selected times), times relative to the earliest copied key; refuses when none. */
export function copyKeys(p: Project, clipId: Id, refs: readonly KeyRef[]): KeysPayload {
  const { clip } = findClip(p, clipId);
  const items: { target: PayloadTarget; picked: AnyKey[] }[] = [];
  for (const r of refs) {
    const list = targetKeys(clip, r.target);
    const k = list?.find((x) => tooClose(x.t, r.t));
    if (!k) continue;
    let target: PayloadTarget;
    if (r.target.kind === 'transform') target = { kind: 'transform', prop: r.target.prop };
    else {
      const o = occurrenceOf(clip, r.target.effectId);
      if (!o) continue;
      target = { kind: 'effect', ...o, param: r.target.param };
    }
    const same = (a: PayloadTarget): boolean => JSON.stringify(a) === JSON.stringify(target);
    const entry = items.find((e) => same(e.target)) ?? items[items.push({ target, picked: [] }) - 1];
    entry.picked.push(k);
  }
  const first = Math.min(...items.flatMap((e) => e.picked.map((k) => k.t)));
  if (items.length === 0) throw new TimelineError('Select keyframes to copy');
  return {
    kind: 'keys',
    sourceKind: clip.kind,
    fit: fitScale(p, clip),
    targets: items.map((e) => ({ target: e.target, keys: copyList(e.picked, first) })),
  };
}

/** The clip's whole animation (keys, loops, orient, effect keys, preset stack); refuses a clip without any. */
export function copyAnimation(p: Project, clipId: Id): AnimPayload {
  const { clip } = findClip(p, clipId);
  const [lo, hi] = localRange(clip);
  const out: AnimPayload = { kind: 'anim', sourceKind: clip.kind, fit: fitScale(p, clip), lo, span: hi - lo, effects: [] };
  if (clip.keys) {
    const k = clip.keys;
    const keys: NonNullable<AnimPayload['keys']> = {};
    for (const prop of ['position', 'scale', 'rotation', 'opacity'] as const) if (k[prop]?.length) keys[prop] = copyList(k[prop]!, lo);
    if (k.loops) keys.loops = copyLoops(k.loops);
    if (k.orient) keys.orient = true;
    if (Object.keys(keys).some((x) => x !== 'loops' && x !== 'orient')) out.keys = keys;
  }
  for (const e of clip.effects) {
    if (!e.keys) continue;
    const o = occurrenceOf(clip, e.id)!;
    const keys = Object.fromEntries(Object.entries(e.keys).filter(([, l]) => l.length > 0).map(([param, l]) => [param, copyList(l, lo)]));
    if (Object.keys(keys).length > 0) out.effects.push({ ...o, keys, ...(e.loops ? { loops: copyLoops(e.loops) } : {}) });
  }
  if (clip.motion) {
    out.motion = structuredClone(clip.motion);
    if (out.motion.emphasis) out.motion.emphasis.at -= lo; // relative like the keys (the loop `phase` is shifted at paste, from `lo`)
  }
  if (!out.keys && out.effects.length === 0 && !out.motion) throw new TimelineError('This clip has no animation to copy');
  return out;
}

/** Whether a payload carries anything (a stored/typed value is trusted only after this and the repair functions). */
export const isEmptyAnim = (a: AnimPayload): boolean => !a.keys && a.effects.length === 0 && !a.motion;

/** Whether the clip carries any animation (transform or effect keys, or a preset stack). */
export const hasAnimation = (c: Clip): boolean => c.keys !== undefined || c.motion !== undefined || c.effects.some((e) => e.keys !== undefined);
