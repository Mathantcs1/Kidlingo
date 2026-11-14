// Whether the Help panel is open and which topic it shows. The panel is rendered by App outside the inert editor and
// counts as a modal there (global shortcuts off, background inert), like the Save-as-preset dialog.
import { create } from 'zustand';

export const useHelp = create<{ open: boolean; topic: string | null }>()(() => ({ open: false, topic: null }));

export const openHelp = (topic: string | null = null): void => useHelp.setState({ open: true, topic });
export const closeHelp = (): void => useHelp.setState({ open: false });
