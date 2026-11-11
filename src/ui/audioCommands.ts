// Store-bound audio commands. Each is ONE `apply` (one undo step); refusals (TimelineError) become toasts.
import { attachAudio, detachAudio, setClipAudio, setTrackVolume } from '../core/audioEdits';
import { findDetachedTwin } from '../core/audioQueries';
import type { ClipAudio, Id } from '../core/model';
import { useEditor } from '../state/store';
import { focusAfterRender, keyboardDriven } from './audioFocus';
import { liveSelection } from './edits';
import { guard } from './Toast';

const editor = () => useEditor.getState();

/** The one selected clip id, or null (audio commands act on a single selection only). */
function singleSelected(): Id | null {
  const live = liveSelection(editor().history.present, editor().selection);
  return live.length === 1 ? live[0] : null;
}

/** Moves the selected video clip's sound onto an audio track and silences the video clip (one undo step). */
export function detachSelectedAudio(): void {
  const id = singleSelected();
  if (!id) return;
  const kb = keyboardDriven();
  guard(() => editor().apply((p) => detachAudio(p, id)));
  focusAfterRender(kb, 'audio-attach', 'inspector-audio');
}

/** Undoes a detach by hand: removes the audio twin and un-silences the selected video clip (one undo step). */
export function attachSelectedAudio(): void {
  const id = singleSelected();
  if (!id) return;
  const kb = keyboardDriven();
  guard(() =>
    editor().apply((p) => {
      const twin = findDetachedTwin(p, id);
      return twin ? attachAudio(p, id, twin.id) : p;
    }),
  );
  focusAfterRender(kb, 'audio-detach', 'inspector-audio');
}

/** Fades (seconds) and pan (−1..1) of the selected clip. */
export function setSelectedClipAudio(patch: Partial<Pick<ClipAudio, 'fadeIn' | 'fadeOut' | 'pan'>>): void {
  const id = singleSelected();
  if (id) guard(() => editor().apply((p) => setClipAudio(p, id, patch)));
}

/** Track level 0..2; allowed on locked tracks. */
export function setTrackVolumeCmd(trackId: Id, volume: number): void {
  guard(() => editor().apply((p) => setTrackVolume(p, trackId, volume)));
}
