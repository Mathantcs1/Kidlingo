// The items of every right-click menu. Each one reuses the command the toolbar / shortcut / header button uses (one
// `apply` per action, refusals toast), with the same enablement; a clip or track that is locked greys the edits.
import { hasAnimation } from '../core/animPayload';
import { detachDisabledReason } from '../core/audioQueries';
import type { Id, Project, Track } from '../core/model';
import { findClip } from '../core/timeline';
import { resetClipTransform } from '../core/transformEdits';
import { useEditor } from '../state/store';
import { animPayload } from './animClipboard';
import { detachSelectedAudio } from './audioCommands';
import { clipPayload } from './clipClipboard';
import { copyClipsCmd, duplicateClipsCmd, pasteClipsAtCmd, pasteClipsCmd } from './clipClipboardCommands';
import { addToTimeline, deleteSelected, mergeSelected, rippleDeleteSelected, splitAtPlayhead } from './commands';
import type { MenuItem } from './contextMenuModel';
import { liveSelection } from './edits';
import { removeMediaItem } from './projectCommands';
import { openSavePreset } from './savePresetUi';
import { useSessionState } from './session';
import { guard } from './Toast';
import { addLayer, moveLayer, removeLayer, toggleTrackFlag } from './trackCommands';
import { moveTarget } from './trackLayout';
import { copyAnimCmd, pasteAnimCmd } from './transferCommands';

const editor = () => useEditor.getState();
const ready = (): boolean => useSessionState.getState().state === 'ready';
const LOCKED = 'Track is locked';

/** Menu of a right-clicked clip (the caller has already selected it when it was not selected). */
export function clipMenuItems(clipId: Id): MenuItem[] {
  const p = editor().history.present;
  const sel = liveSelection(p, editor().selection);
  const found = findClip(p, clipId);
  if (!found) return [];
  const clip = found.clip;
  const edit = ready();
  const locked = found.track.locked;
  const canEdit = edit && !locked;
  const lockTitle = locked ? LOCKED : undefined;
  const detach = detachDisabledReason(p, sel);
  const animated = hasAnimation(clip);
  const single = sel.length === 1;
  const items: MenuItem[] = [
    { id: 'copy', label: 'Copy', shortcut: 'Mod+C', disabled: !edit, onSelect: copyClipsCmd },
    { id: 'paste', label: 'Paste', shortcut: 'Mod+V', disabled: !canEdit || clipPayload() === null, title: lockTitle, onSelect: pasteClipsCmd },
    { id: 'duplicate', label: 'Duplicate', shortcut: 'Mod+D', disabled: !canEdit, title: lockTitle, onSelect: duplicateClipsCmd },
    'separator',
    { id: 'split', label: 'Split at playhead', shortcut: 'S', disabled: !canEdit, title: lockTitle, onSelect: splitAtPlayhead },
    { id: 'delete', label: 'Delete', shortcut: 'Delete', disabled: !canEdit, title: lockTitle, onSelect: deleteSelected },
    { id: 'ripple-delete', label: 'Ripple delete', shortcut: 'Shift+Delete', disabled: !canEdit, title: lockTitle, onSelect: rippleDeleteSelected },
  ];
  if (clip.kind === 'video') items.push({ id: 'detach', label: 'Detach audio', disabled: !edit || detach !== null, title: detach ?? undefined, onSelect: detachSelectedAudio });
  if (sel.length >= 2) items.push({ id: 'merge', label: 'Merge', disabled: !canEdit, title: lockTitle, onSelect: mergeSelected });
  items.push('separator');
  items.push({ id: 'copy-anim', label: 'Copy animation', shortcut: 'Mod+Alt+C', disabled: !edit || !single || !animated, title: animated ? undefined : 'This clip has no animation', onSelect: copyAnimCmd });
  items.push({ id: 'paste-anim', label: 'Paste animation', shortcut: 'Mod+Alt+V', disabled: !canEdit || animPayload() === null, title: lockTitle, onSelect: () => pasteAnimCmd() });
  if (animated) items.push({ id: 'save-preset', label: 'Save as preset…', disabled: !edit || !single, onSelect: () => openSavePreset(clipId) });
  if (clip.kind !== 'audio') {
    items.push('separator');
    items.push({
      id: 'reset-transform',
      label: 'Reset transform',
      disabled: !canEdit || !single,
      title: lockTitle,
      onSelect: () => guard(() => editor().apply((q: Project) => resetClipTransform(q, clipId))),
    });
  }
  return items;
}

/** Menu of an empty spot of a lane: paste there (at the clicked time) and add a track. */
export function laneMenuItems(track: Track, time: number): MenuItem[] {
  const edit = ready();
  return [
    { id: 'paste', label: 'Paste', shortcut: 'Mod+V', disabled: !edit || track.locked || clipPayload() === null, title: track.locked ? LOCKED : undefined, onSelect: () => pasteClipsAtCmd(track.id, time) },
    'separator',
    { id: 'add-video-layer', label: 'Add video layer', disabled: !edit, onSelect: () => addLayer('video') },
    { id: 'add-audio-track', label: 'Add audio track', disabled: !edit, onSelect: () => addLayer('audio') },
  ];
}

/** Menu of a track header: the header buttons' commands. Mute, solo, lock and hide always work (lock is how a track unlocks). */
export function trackMenuItems(track: Track): MenuItem[] {
  const p = editor().history.present;
  const edit = ready();
  const same = p.tracks.filter((t) => t.kind === track.kind).length;
  const up = moveTarget(p.tracks, track.id, 'up') !== null;
  const down = moveTarget(p.tracks, track.id, 'down') !== null;
  const items: MenuItem[] = [
    { id: 'mute', label: track.muted ? 'Unmute' : 'Mute', disabled: !edit, onSelect: () => toggleTrackFlag(track.id, 'muted') },
    { id: 'solo', label: track.solo ? 'Unsolo' : 'Solo', disabled: !edit, onSelect: () => toggleTrackFlag(track.id, 'solo') },
    { id: 'lock', label: track.locked ? 'Unlock' : 'Lock', disabled: !edit, onSelect: () => toggleTrackFlag(track.id, 'locked') },
  ];
  if (track.kind === 'video') items.push({ id: 'hide', label: track.hidden ? 'Show' : 'Hide', disabled: !edit, onSelect: () => toggleTrackFlag(track.id, 'hidden') });
  items.push('separator');
  items.push({ id: 'move-up', label: 'Move up', disabled: !edit || !up, onSelect: () => moveLayer(track.id, 'up') });
  items.push({ id: 'move-down', label: 'Move down', disabled: !edit || !down, onSelect: () => moveLayer(track.id, 'down') });
  items.push('separator');
  items.push({ id: 'delete-track', label: 'Delete track', disabled: !edit || same <= 1 || track.locked, title: track.locked ? LOCKED : same <= 1 ? 'The last track of its kind stays' : undefined, onSelect: () => void removeLayer(track.id) });
  return items;
}

/** Menu of a media bin item. */
export function mediaMenuItems(mediaId: Id): MenuItem[] {
  const edit = ready();
  return [
    { id: 'add-to-timeline', label: 'Add to timeline', disabled: !edit, onSelect: () => addToTimeline(mediaId) },
    { id: 'remove-media', label: 'Remove from project', disabled: !edit, onSelect: () => void removeMediaItem(mediaId) },
  ];
}
