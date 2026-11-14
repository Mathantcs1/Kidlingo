// The animation clipboard (Plan 5B D8): copied keys and the copied whole animation, in memory only (not history, not
// saved), cleared when the project is replaced (New project, restore). A payload is never consumed: paste repeatedly.
import { create } from 'zustand';
import type { AnimPayload, KeysPayload } from '../core/animPayload';
import { onProjectReplaced } from './copySource';

interface AnimClipboard {
  keys: KeysPayload | null;
  anim: AnimPayload | null;
}

export const useAnimClipboard = create<AnimClipboard>()(() => ({ keys: null, anim: null }));

export const keysPayload = (): KeysPayload | null => useAnimClipboard.getState().keys;
export const animPayload = (): AnimPayload | null => useAnimClipboard.getState().anim;
export const setKeysPayload = (keys: KeysPayload | null): void => useAnimClipboard.setState({ keys });
export const setAnimPayload = (anim: AnimPayload | null): void => useAnimClipboard.setState({ anim });

onProjectReplaced(() => useAnimClipboard.setState({ keys: null, anim: null }));
