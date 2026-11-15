import { create } from 'zustand';
import { useSettings } from './settingsState';

interface AiVoiceState {
  open: boolean;
  openDialog(): void;
  closeDialog(): void;
}

export const useAiVoice = create<AiVoiceState>()((set) => ({
  open: false,
  openDialog: () => set({ open: true }),
  closeDialog: () => set({ open: false }),
}));

/** The toolbar button: opens the dialog when a key is saved, otherwise Settings (where the key is added). */
export function openAiVoiceOrSettings(): void {
  if (useSettings.getState().hasKey) useAiVoice.getState().openDialog();
  else useSettings.getState().openSettings();
}
