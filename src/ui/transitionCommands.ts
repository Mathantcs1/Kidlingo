// Store-bound transition commands (Plan 5C Task 8): each is ONE `apply` (one undo step); refusals (locked track, no
// handle, adjustment clip, ...) become toasts through `guard`. The last type/duration used is remembered for "+" and `T`.
import { addTransition, removeTransition, setTransitionDuration } from '../core/transitionEdits';
import type { TransitionSpec } from '../core/transitionEdits';
import { DEFAULT_TRANSITION_SECONDS } from '../core/transitionTypes';
import type { Id } from '../core/model';
import { useEditor } from '../state/store';
import { selectedTransitionId, setSelectedTransition } from './transitionSelection';
import { nearestCut } from './transitionDrag';
import { guard, showError, showInfo } from './Toast';

const editor = () => useEditor.getState();

let lastSpec: TransitionSpec = { type: 'dissolve', duration: DEFAULT_TRANSITION_SECONDS };
/** The type and duration the next "+" / `T` adds (the last one used in this session; default a 1 s dissolve). */
export const lastTransitionSpec = (): TransitionSpec => lastSpec;
export const setLastTransitionSpec = (spec: TransitionSpec): void => {
  lastSpec = { ...spec };
};

const allIds = (p: ReturnType<typeof editor>['history']['present']): Set<Id> => new Set(p.tracks.flatMap((t) => (t.transitions ?? []).map((x) => x.id)));

/** Selects a transition chip (and leaves the clip selection: they are exclusive). */
export function selectTransitionCmd(id: Id): void {
  if (editor().selection.length > 0) editor().select([]);
  setSelectedTransition(id);
}

/** Adds the last-used transition (an audio crossfade on an audio track) on the cut between two clips; selects it. */
export function addTransitionCmd(trackId: Id, fromClipId: Id, toClipId: Id, spec?: TransitionSpec): void {
  guard(() => {
    const before = editor().history.present;
    const track = before.tracks.find((t) => t.id === trackId);
    const chosen: TransitionSpec = spec ?? (track?.kind === 'audio' ? { type: 'audio', duration: lastSpec.duration } : lastSpec);
    editor().apply((p) => addTransition(p, trackId, fromClipId, toClipId, chosen));
    const now = editor().history.present;
    const old = allIds(before);
    const added = now.tracks.flatMap((t) => t.transitions ?? []).find((x) => !old.has(x.id));
    if (!added) return;
    if (chosen.duration !== undefined && added.duration < chosen.duration - 1e-6) showInfo('Transition shortened to the footage available beyond the cut');
    selectTransitionCmd(added.id);
  });
}

export function removeTransitionCmd(id: Id): void {
  guard(() => editor().apply((p) => removeTransition(p, id)));
}

/** Delete/Backspace with a transition selected. */
export function deleteSelectedTransition(): void {
  const id = selectedTransitionId();
  if (id !== null) removeTransitionCmd(id);
}

/** A chip duration commit (the drag's release or a field): ONE step; a longer wish is shortened to what the handles allow. */
export function setTransitionDurationCmd(id: Id, seconds: number): void {
  guard(() => {
    editor().apply((p) => setTransitionDuration(p, id, seconds));
    const tr = editor().history.present.tracks.flatMap((t) => t.transitions ?? []).find((x) => x.id === id);
    if (tr && seconds - tr.duration > 1.5 / editor().history.present.format.fps) showInfo('Transition shortened to the footage available beyond the cut');
    if (tr) setLastTransitionSpec({ ...lastSpec, duration: tr.duration });
  });
}

/** `T`: the last-used transition at the cut nearest the playhead on the selected clip's track (else the active track). */
export function addTransitionAtPlayheadCmd(): void {
  const s = editor();
  const p = s.history.present;
  const selected = s.selection.length === 1 ? p.tracks.find((t) => t.clips.some((c) => c.id === s.selection[0])) : undefined;
  const trackId = selected?.id ?? s.activeTrackId ?? p.tracks.find((t) => t.kind === 'video')?.id;
  if (trackId && p.tracks.find((t) => t.id === trackId)?.locked) return showError('Track is locked');
  const cut = trackId ? nearestCut(p, trackId, s.playhead) : null;
  if (!cut) return showError('No cut without a transition near the playhead on this track');
  addTransitionCmd(cut.trackId, cut.fromClipId, cut.toClipId);
}
