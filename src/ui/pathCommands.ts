// Store-bound motion path commands (Plan 5B Task 8): each is ONE `apply` (one undo step) through `guard`, so a refusal
// (locked track, too few keys, a rotation bake out of range) becomes a toast and adds no step.
import { setOrientAt } from '../core/orientBake';
import { setKeyPosition, setKeyTangents, smoothPath } from '../core/pathEdits';
import type { PathChange } from '../core/pathEdits';
import type { Id, Project } from '../core/model';
import { findClip } from '../core/timeline';
import { useEditor } from '../state/store';
import { cornerTogglePatch } from './pathDragMath';
import { guard } from './Toast';

const editor = () => useEditor.getState();
const apply = (fn: (p: Project) => Project): void => guard(() => editor().apply(fn));

/** The release of a path drag: exactly the change its live preview showed (withLivePath), ONE step; a no-op adds none. */
export function commitPathChangeCmd(clipId: Id, change: PathChange): void {
  apply((p) => {
    let q = change.xy ? setKeyPosition(p, clipId, change.u, change.xy) : p;
    if (change.tangents) q = setKeyTangents(q, clipId, change.u, change.tangents);
    return q;
  });
}

/** "Smooth path" (mp-smooth): Catmull-Rom tangents on every position key, ONE step. */
export const smoothPathCmd = (clipId: Id): void => apply((p) => smoothPath(p, clipId));

/** Double-click on a key dot: corner <-> smooth for the position key at local time `u` (pathDragMath), ONE step. */
export function toggleCornerCmd(clipId: Id, u: number): void {
  apply((p) => {
    const list = findClip(p, clipId).clip.keys?.position ?? [];
    const i = list.findIndex((k) => k.t === u);
    return i < 0 ? p : setKeyTangents(p, clipId, u, cornerTogglePatch(list, i));
  });
}

/** The orient toggle (kf-orient): on needs two position keys; off bakes the heading at the playhead (setOrientAt). */
export function setOrientCmd(clipId: Id, on: boolean): void {
  const { playhead } = editor();
  apply((p) => setOrientAt(p, clipId, on, playhead));
}
