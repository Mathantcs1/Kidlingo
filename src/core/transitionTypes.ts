// Transition data (Plan 5C D1): a transition belongs to a CUT of one track, between two adjacent clips, centred on the
// cut. Types only (and the constants every edit shares); the fields are optional on Track so v9 saves are unchanged.
import type { Ease } from './easing';
import type { Id } from './model';

export type TransitionType = 'dip' | 'dissolve' | 'wipe' | 'slide' | 'push' | 'zoom' | 'glitch' | 'audio';
export const TRANSITION_TYPES: readonly TransitionType[] = ['dip', 'dissolve', 'wipe', 'slide', 'push', 'zoom', 'glitch', 'audio'];
export type TransitionDirection = 'left' | 'right' | 'up' | 'down';
export const TRANSITION_DIRECTIONS: readonly TransitionDirection[] = ['left', 'right', 'up', 'down'];
/** The audio crossfade law: equal power (default) or constant gain (exact for two halves of one shot). */
export type CrossfadeLaw = 'power' | 'gain';

export interface Transition {
  id: Id;
  /** The outgoing clip; its end is the cut. */
  fromClipId: Id;
  /** The incoming clip; its start is the cut. */
  toClipId: Id;
  type: TransitionType;
  /** Seconds, centred on the cut; a whole EVEN number of project frames (D4). */
  duration: number;
  ease: Ease;
  /** wipe, slide, push. */
  direction?: TransitionDirection;
  /** wipe: edge softness 0..0.5 of the frame. */
  softness?: number;
  /** zoom: the zoom factor 1.2..4; glitch: strength 0..1. */
  amount?: number;
  audio?: CrossfadeLaw;
}

/** Shortest transition, in frames (the window has an even frame count). */
export const MIN_TRANSITION_FRAMES = 2;
/** Longest transition (seconds). */
export const MAX_TRANSITION_SECONDS = 5;
export const DEFAULT_TRANSITION_SECONDS = 1;
/** The eases a transition may use: no overshoot, so a wipe edge or a slide never leaves the frame (D5). */
export const TRANSITION_EASES: readonly string[] = ['linear', 'easeIn', 'easeOut', 'easeInOut', 'bezier'];
export const NOT_ENOUGH_FOOTAGE = 'Not enough footage beyond the cut for a transition: trim the clips to leave some';
