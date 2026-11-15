import { create } from 'zustand';
import { keyStore } from '../ai/keyStore';

interface SettingsState {
  open: boolean;
  /** Whether an ElevenLabs key is saved (never the key itself). */
  hasKey: boolean;
  openSettings(): void;
  closeSettings(): void;
  refreshHasKey(): Promise<void>;
}

export const useSettings = create<SettingsState>()((set) => ({
  open: false,
  hasKey: false,
  openSettings: () => set({ open: true }),
  closeSettings: () => set({ open: false }),
  async refreshHasKey() {
    set({ hasKey: await keyStore.hasKey() });
  },
}));
