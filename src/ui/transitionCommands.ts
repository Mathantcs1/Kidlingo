// Store-bound transition commands (Plan 5C Task 8): each is ONE `apply` (one undo step); refusals (locked track, no
// handle, adjustment clip, ...) become toasts through `guard`. The last type/duration used is remembered for "+" and `T`.
import { joinTransitionReport } from '../core/merge';
import { addTransition, removeTransition, setTransition, setTransitionDuration } from '../core/transitionEdits';
import type { TransitionSpec } from '../core/transitionEdits';
import { DEFAULT_TRANSITION_SECONDS } from '../core/transitionTypes';
import type { TransitionType } from '../core/transitionTypes';
import type { Id } from '../core/model';
import { useEditor } from '../state/store';
import { selectedTransitionId, setSelectedTransition } from './transitionSelection';
import { nearestCut } from './transitionDrag';
import { cutsOf } from '../core/transitions';
import { liveSelection, mergeClips } from './edits';
import { guard, showError, showInfo } from './Toast';

const editor = () => useEditor.getState();

let lastSpec: TransitionSpec = { type: 'dissolve', duration: DEFAULT_TRANSITION_SECONDS };
/** The type and duration the next "+" / `T` adds (the last one used in this session; default a 1 s dissolve). */
export const lastTransitionSpec = (): TransitionSpec => lastSpec;
export const setLastTransitionSpec = (spec: TransitionSpec): void => {
  lastSpec = { ...spec };
};

/** The last spec as a PICTURE transition (an audio crossfade type never goes onto a video cut). */
const pictureSpec = (): TransitionSpec => (lastSpec.type === 'audio' ? { ...lastSpec, type: 'dissolve' } : lastSpec);

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
    const chosen: TransitionSpec = spec ?? (track?.kind === 'audio' ? { type: 'audio', duration: lastSpec.duration } : pictureSpec());
    editor().apply((p) => addTransition(p, trackId, fromClipId, toClipId, chosen));
    const now = editor().history.present;
    const old = allIds(before);
    const added = now.tracks.flatMap((t) => t.transitions ?? []).find((x) => !old.has(x.id));
    if (!added) return;
    if (chosen.duration !== undefined && added.duration < chosen.duration - 1e-6) showInfo('Transition shortened to the footage available beyond the cut');
    if (added.type !== 'audio') setLastTransitionSpec({ ...lastSpec, type: added.type }); // remembered only after the add succeeded
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

/** A type / ease / direction / softness / amount / audio-law change from the inspector: ONE step; a new type is remembered for "+" and `T`. */
export function setTransitionCmd(id: Id, patch: Partial<Omit<TransitionSpec, 'duration'>>): void {
  guard(() => {
    editor().apply((p) => setTransition(p, id, patch));
    if (patch.type && patch.type !== 'audio') setLastTransitionSpec({ ...lastSpec, type: patch.type });
  });
}

/**
 * `T` and a browser tile click: the last-used transition (or `type`) at the cut nearest the playhead on the selected clip's
 * track (else the active track).
 */
export function addTransitionAtPlayheadCmd(type?: TransitionType): void {
  const s = editor();
  const p = s.history.present;
  const selected = s.selection.length === 1 ? p.tracks.find((t) => t.clips.some((c) => c.id === s.selection[0])) : undefined;
  const trackId = selected?.id ?? s.activeTrackId ?? p.tracks.find((t) => t.kind === (type === 'audio' ? 'audio' : 'video'))?.id;
  if (trackId && p.tracks.find((t) => t.id === trackId)?.locked) return showError('Track is locked');
  const cut = trackId ? nearestCut(p, trackId, s.playhead) : null;
  if (!cut) return showError('No cut without a transition near the playhead on this track');
  const spec = type ? { ...pictureSpec(), type } : undefined;
  addTransitionCmd(cut.trackId, cut.fromClipId, cut.toClipId, spec);
}

/** The clip menu's "Add transition at start / end": on the cut between this clip and its neighbour. */
export function addTransitionAtEdgeCmd(clipId: Id, edge: 'start' | 'end'): void {
  const p = editor().history.present;
  const track = p.tracks.find((t) => t.clips.some((c) => c.id === clipId));
  const cut = track ? cutsOf(track).find((c) => (edge === 'start' ? c.to.id : c.from.id) === clipId) : undefined;
  if (!track || !cut) return showError(edge === 'start' ? 'No clip meets this one at its start' : 'No clip meets this one at its end');
  addTransitionCmd(track.id, cut.from.id, cut.to.id);
}

/** The toast line of a merge with crossfades: how many were added, shortened to the footage, and skipped for lack of footage. */
export function mergeReportMessage(r: { added: number; shortened: number; skipped: number }): string {
  const parts = [`${r.added} crossfade${r.added === 1 ? '' : 's'} added`];
  if (r.shortened > 0) parts.push(`${r.shortened} shortened to the footage available`);
  if (r.skipped > 0) parts.push(`${r.skipped} cut${r.skipped === 1 ? '' : 's'} skipped: no footage beyond ${r.skipped === 1 ? 'it' : 'them'}`);
  return `Merged: ${parts.join(', ')}`;
}

/**
 * "Merge with crossfade": joins the selected clips (ONE step) and adds the last-used transition (a dissolve unless the last one
 * was a picture type; an audio crossfade on an audio track) at every new cut between them; the toast says what was added or skipped.
 */
export function mergeSelectedWithTransitionCmd(): void {
  guard(() => {
    const p = editor().history.present;
    const start = (id: Id): number => p.tracks.flatMap((t) => t.clips).find((c) => c.id === id)?.start ?? 0;
    const ids = [...liveSelection(p, editor().selection)].sort((x, y) => start(x) - start(y)); // as mergeClips orders them
    const onAudio = p.tracks.find((t) => t.clips.some((c) => c.id === ids[0]))?.kind === 'audio';
    const spec: TransitionSpec = onAudio ? { type: 'audio', duration: lastSpec.duration } : lastSpec.type === 'audio' ? { ...lastSpec, type: 'dissolve' } : lastSpec;
    const report = joinTransitionReport(p, ids, spec);
    editor().apply((q) => mergeClips(q, ids, { transition: spec }));
    showInfo(mergeReportMessage(report));
  });
}
