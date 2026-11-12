// Edits that treat several animation targets as ONE property (Plan 5 Task 7): the chroma key colour is three effect
// params (keyR/G/B) that must change together. Each is a fold of the single-target edits, so the whole group is ONE
// pure project edit (one `apply`, one undo step) and a refusal on any member refuses everything.
import { setAnimated, setValueAt } from './keyframeEdits';
import type { AnimTarget, AnimValue } from './keyframeEdits';
import type { Id, Project } from './model';

/** Animation on/off for every target at timeline time `t` (same project when each already is in that state). */
export function setTargetsAnimated(p: Project, clipId: Id, targets: readonly AnimTarget[], on: boolean, t: number): Project {
  return targets.reduce((q, target) => setAnimated(q, clipId, target, on, t), p);
}

/** Sets every target to its value at `t`: a key where animated, the static edit elsewhere. */
export function setTargetsAt(p: Project, clipId: Id, entries: readonly { target: AnimTarget; value: AnimValue }[], t: number): Project {
  return entries.reduce((q, { target, value }) => setValueAt(q, clipId, target, value, t), p);
}

/** Several params of one effect set together at `t` (keys on the animated ones, static values on the rest). */
export function setEffectParamsAt(p: Project, clipId: Id, effectId: Id, params: Readonly<Record<string, number>>, t: number): Project {
  const entries = Object.entries(params).map(([param, value]) => ({ target: { kind: 'effect', effectId, param } as AnimTarget, value }));
  return setTargetsAt(p, clipId, entries, t);
}
