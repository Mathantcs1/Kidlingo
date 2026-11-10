// Instrumentation for tests and leak checks: audio buffer sizes and live playback nodes.

export interface AudioStats {
  /** Largest AudioBuffer created (decoded or rendered) since the last reset, in samples x channels. */
  largestBuffer: number;
  /** Mixdown / playback windows rendered or scheduled since the last reset. */
  windows: number;
  /** Live-playback source nodes scheduled and not yet ended or stopped. */
  liveNodes: number;
  /** Most live-playback source nodes alive at once since the last reset. */
  liveNodesPeak: number;
}

const stats: AudioStats = { largestBuffer: 0, windows: 0, liveNodes: 0, liveNodesPeak: 0 };

export function audioStats(): AudioStats {
  return { ...stats };
}

/** Clears the counters (live nodes still alive are kept). */
export function resetAudioStats(): void {
  stats.largestBuffer = 0;
  stats.windows = 0;
  stats.liveNodesPeak = stats.liveNodes;
}

export function noteAudioBuffer(b: AudioBuffer): void {
  stats.largestBuffer = Math.max(stats.largestBuffer, b.length * b.numberOfChannels);
}

export function noteWindow(): void {
  stats.windows++;
}

export function noteLiveNodes(delta: number): void {
  stats.liveNodes += delta;
  stats.liveNodesPeak = Math.max(stats.liveNodesPeak, stats.liveNodes);
}
