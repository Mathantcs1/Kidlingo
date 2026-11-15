// Speed data (Plan 5D D2, data v9; the version bump and migration come in Task 3). Every field is optional and absent =
// today's behaviour, so a clip without them is unchanged.
import type { Keyframe } from './keyTypes';

/** The legal speed range (O1: 0.25x-4x). */
export const MIN_SPEED = 0.25;
export const MAX_SPEED = 4;

export interface SpeedFields {
  /** Constant speed 0.25..4 (absent = 1; 1 is never stored). */
  speed?: number;
  /** Plays the footage range backwards (the clip still covers [in, out)). */
  reverse?: true;
  /** The ramp: `v` is the speed at FOOTAGE time `t` (O4); present and non-empty it wins over `speed`. */
  speedKeys?: Keyframe[];
  /** Absent = pitch preserved when the clip is stretched. */
  preservePitch?: false;
  /** A freeze frame: every timeline time shows footage time `at` (video clips only). */
  freeze?: { at: number };
}
