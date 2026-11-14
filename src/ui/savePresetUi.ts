// Which clip the "Save as preset" dialog is open for (null = closed). The dialog is rendered by App OUTSIDE the
// inert editor and counts as a modal there (global shortcuts off, background inert), like Confirm and Export.
import { create } from 'zustand';
import type { Id } from '../core/model';

export const useSavePresetUi = create<{ clipId: Id | null }>()(() => ({ clipId: null }));

export const openSavePreset = (clipId: Id): void => useSavePresetUi.setState({ clipId });
export const closeSavePreset = (): void => useSavePresetUi.setState({ clipId: null });
