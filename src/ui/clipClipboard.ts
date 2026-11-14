// The clip clipboard (Plan 5B Task 9, Part 1): the last copied clips, kept in memory only. Not history, not saved,
// cleared when the project is replaced. One copy can be pasted any number of times (a payload is never consumed).
import { create } from 'zustand';
import type { ClipPayload } from '../core/clipClipboard';
import { onProjectReplaced } from './copySource';

export const useClipClipboard = create<{ payload: ClipPayload | null }>()(() => ({ payload: null }));

export const clipPayload = (): ClipPayload | null => useClipClipboard.getState().payload;
export const setClipPayload = (payload: ClipPayload | null): void => useClipClipboard.setState({ payload });

onProjectReplaced(() => setClipPayload(null));
