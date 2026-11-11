// DOM-free Normalise: the gain that brings a clip's loudest peak to a target level.
import type { Clip } from '../../core/model';
import { peakAt } from '../../media/peaks';
import type { Peaks } from '../../media/peaks';
import { clampParams } from './params';

/**
 * Gain in dB that lifts (or lowers) the clip's peak over its source range [in, out) to `targetDb` dBFS, clamped
 * to the `gain` effect's range. It measures the SOURCE audio (the cached waveform): the clip volume, fades and the
 * other effects in the chain are ignored. Silence (or no peak data) gives 0. Peaks are 8-bit, so the result is within about
 * 0.1 dB of the exact sample peak.
 */
export function normaliseGainDb(peaks: Peaks, clip: Clip, targetDb = -1): number {
  const { min, max } = peakAt(peaks, clip.in, clip.out);
  const peak = Math.max(Math.abs(min), Math.abs(max));
  if (!(peak > 0)) return 0;
  return clampParams('gain', { gainDb: targetDb - 20 * Math.log10(peak) }).gainDb;
}
