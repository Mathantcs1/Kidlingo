// Which kind of thing was copied last: Ctrl/Cmd+V pastes THAT (clips, timeline keys, or a whole animation). UI state,
// not history; cleared with the clipboards when the project is replaced (New project, restore).
import { create } from 'zustand';
import { useEditor } from '../state/store';

export type CopyKind = 'clips' | 'keys' | 'anim';

export const useCopySource = create<{ kind: CopyKind | null }>()(() => ({ kind: null }));

export const copySource = (): CopyKind | null => useCopySource.getState().kind;
export const setCopySource = (kind: CopyKind | null): void => {
  if (copySource() !== kind) useCopySource.setState({ kind });
};

/** Runs `fn` when the editor loaded a different project (New project, restore): clipboards hold project-bound data. */
export function onProjectReplaced(fn: () => void): void {
  useEditor.subscribe((now, prev) => {
    if (now.epoch !== prev.epoch) fn();
  });
}

onProjectReplaced(() => setCopySource(null));
