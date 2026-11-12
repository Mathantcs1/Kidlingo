// Timeline key selection (Plan 5 D10): which summary diamonds of one clip are selected. UI state, not history: it is
// cleared when the clip selection changes and on undo/redo, and pruned when an edit removes or hides its keys.
import { create } from 'zustand';
import { keyRefsAt, keyTimes } from '../core/keyframeEdits';
import type { KeyRef } from '../core/keyframeEdits';
import { tooClose } from '../core/keyframes';
import type { Clip, Id, Project } from '../core/model';
import { useEditor } from '../state/store';
import type { EditorState } from '../state/store';
import { keyVisible } from './keyframeCommands';

/** Selected summary key times (clip-LOCAL seconds, sorted) of one clip. */
export interface KeySel {
  clipId: Id | null;
  times: readonly number[];
}

export const NO_KEYS: KeySel = { clipId: null, times: [] };

/** The clip's distinct key times on its visible range (the summary diamonds); none for audio clips. */
export const visibleKeyTimes = (clip: Clip): number[] => (clip.kind === 'audio' ? [] : keyTimes(clip).filter((u) => keyVisible(clip, u)));

export const isPicked = (s: KeySel, clipId: Id, u: number): boolean => s.clipId === clipId && s.times.some((t) => tooClose(t, u));

/** A plain pick selects only `u`; an additive pick (Shift/Ctrl/Cmd) toggles `u` within the same clip. */
export function pickKey(s: KeySel, clipId: Id, u: number, additive: boolean): KeySel {
  if (!additive || s.clipId !== clipId) return { clipId, times: [u] };
  const times = isPicked(s, clipId, u) ? s.times.filter((t) => !tooClose(t, u)) : [...s.times, u].sort((a, b) => a - b);
  return times.length > 0 ? { clipId, times } : NO_KEYS;
}

const findClip = (p: Project, id: Id): Clip | undefined => {
  for (const t of p.tracks) for (const c of t.clips) if (c.id === id) return c;
  return undefined;
};

/** `s` valid for `p`: times without a visible key dropped; NO_KEYS when the clip is gone or not selected. Same object when valid. */
export function pruneKeySel(s: KeySel, p: Project, clipSelection: readonly Id[]): KeySel {
  if (s.clipId === null) return s;
  const clip = clipSelection.includes(s.clipId) ? findClip(p, s.clipId) : undefined;
  if (!clip) return NO_KEYS;
  const visible = visibleKeyTimes(clip);
  const times: number[] = [];
  for (const t of s.times) {
    const v = visible.find((x) => tooClose(x, t));
    if (v !== undefined) times.push(v);
  }
  if (times.length === 0) return NO_KEYS;
  return times.length === s.times.length && times.every((t, i) => t === s.times[i]) ? s : { clipId: s.clipId, times };
}

/** Every key at the selected times, one ref per animated target (three for the chroma key colour). */
export const selectedRefs = (clip: Clip, times: readonly number[]): KeyRef[] => times.flatMap((u) => keyRefsAt(clip, u));

type Editor = Pick<EditorState, 'history' | 'selection'>;

/** The selection after an editor change: cleared by undo/redo and by a new clip selection, pruned by any other edit. */
export function followEditor(s: KeySel, now: Editor, prev: Editor): KeySel {
  if (s.clipId === null) return s;
  if (now.selection !== prev.selection) return NO_KEYS;
  const h = now.history;
  const ph = prev.history;
  if (h.present === ph.present) return s;
  if (h.present === ph.past[ph.past.length - 1] || h.present === ph.future[0]) return NO_KEYS;
  return pruneKeySel(s, h.present, now.selection);
}

export const useKeySelection = create<{ sel: KeySel }>()(() => ({ sel: NO_KEYS }));

export const keySel = (): KeySel => useKeySelection.getState().sel;
export const setKeySel = (sel: KeySel): void => {
  if (sel !== keySel()) useKeySelection.setState({ sel });
};

useEditor.subscribe((now, prev) => setKeySel(followEditor(keySel(), now, prev)));
