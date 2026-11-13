// Key loop edits (data v7, Plan 5B D4): set or remove the loop of one animated target in ONE project. Locked tracks
// refuse; a loop needs two keys; same-reference no-ops; never mutates input.
import { assertTarget, targetKeys } from './animTargets';
import type { AnimTarget } from './animTargets';
import { commitClip } from './keyEditHelpers';
import { LOOP_COUNT_MAX, LOOP_MODES } from './keyTypes';
import type { Id, KeyLoop, Project } from './model';
import { targetLoop, withTargetLoop } from './targetLoops';
import { TimelineError, assertUnlocked, findClip } from './timeline';

export const LOOP_NEEDS_KEYS = 'A loop needs two keyframes';

/** A valid loop from the edit's input: a known mode; count null (until the clip end) or a finite number rounded and clamped to 1..1000. */
function checkedLoop(loop: KeyLoop): KeyLoop {
  if (typeof loop !== 'object' || loop === null || !LOOP_MODES.includes(loop.mode)) throw new TimelineError('Unknown loop mode');
  const c = loop.count;
  if (c === null) return { mode: loop.mode, count: null };
  if (typeof c !== 'number' || !Number.isFinite(c)) throw new TimelineError('Invalid loop count');
  return { mode: loop.mode, count: Math.min(LOOP_COUNT_MAX, Math.max(1, Math.round(c))) };
}

/**
 * Sets the loop of `target` on clip `clipId` (D4), or removes it with `null`. Refused on a locked track, for a target
 * the clip cannot animate (assertTarget), and, when setting, with fewer than two keys ('A loop needs two keyframes').
 * The same project when nothing changes (removing an absent loop, setting the loop it already has).
 */
export function setKeyLoop(p: Project, clipId: Id, target: AnimTarget, loop: KeyLoop | null): Project {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  assertTarget(clip, target);
  const cur = targetLoop(clip, target);
  if (loop === null) return cur ? commitClip(p, clipId, withTargetLoop(clip, target, undefined)) : p;
  const next = checkedLoop(loop);
  if ((targetKeys(clip, target)?.length ?? 0) < 2) throw new TimelineError(LOOP_NEEDS_KEYS);
  if (cur && cur.mode === next.mode && cur.count === next.count) return p;
  return commitClip(p, clipId, withTargetLoop(clip, target, next));
}
