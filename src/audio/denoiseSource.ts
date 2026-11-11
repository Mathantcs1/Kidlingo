// The per-clip noise profile (review ruling): decoded from fixed probes of the clip's source range, independent of
// any render window, cached per media and range with in-flight dedupe, so concurrent windows share one estimate.
import type { Clip } from '../core/model';
import { decodeAudioRange } from '../media/audioDecode';
import type { DecodedAudio } from '../media/audioDecode';
import { denoiseBuffer } from './denoise';
import { estimateNoise, profileProbes } from './denoiseProfile';
import type { ChannelNoise } from './denoiseProfile';
import { clampParams } from './effects/params';

/** Most profiles kept (each is a few KB per channel); the oldest is dropped first. */
const CACHE_SIZE = 64;
const cache = new Map<string, Promise<ChannelNoise[] | null>>();

type ProbeDecoder = typeof decodeAudioRange;
let decodeProbe: ProbeDecoder = decodeAudioRange;

/** Test seam (dev harness only): replaces the probe decoder, e.g. with one that fails; null restores the real one. */
export function setProbeDecoder(fn: ProbeDecoder | null): void {
  decodeProbe = fn ?? decodeAudioRange;
}

/**
 * Never rejects: a probe decode that fails degrades the clip to NO noise reduction (null, cached like any result,
 * so it is not retried for every window); the segment's own decode keeps its error handling. No abort signal:
 * the estimate is shared by every caller, and each checks its own signal after awaiting it.
 */
async function estimate(clip: Clip, ctx: BaseAudioContext): Promise<ChannelNoise[] | null> {
  const probes: Float32Array[][] = [];
  try {
    for (const [from, to] of profileProbes(clip.in, clip.out)) {
      const d = await decodeProbe(clip.mediaId, from, to, ctx);
      if (!d) continue;
      for (let c = 0; c < d.buffer.numberOfChannels; c++) (probes[c] ??= []).push(d.buffer.getChannelData(c));
    }
  } catch (e) {
    console.warn('clipforge: noise profile unavailable, noise reduction skipped for this clip', e);
    return null;
  }
  return probes.length ? probes.map((p) => estimateNoise(p)) : null;
}

/**
 * The noise profile (one ChannelNoise per source channel) of the clip's [in, out) source range, or null when it
 * has no audio there or its probes cannot be decoded (then the clip plays without noise reduction). Depends only on the media and that range, never on the render window.
 */
export function clipNoiseProfile(clip: Clip, ctx: BaseAudioContext): Promise<ChannelNoise[] | null> {
  const key = `${clip.mediaId}|${clip.in}|${clip.out}`;
  let p = cache.get(key);
  if (!p) {
    p = estimate(clip, ctx);
    cache.set(key, p);
    if (cache.size > CACHE_SIZE) cache.delete(cache.keys().next().value!);
  }
  return p;
}

/**
 * The buffer a segment's source plays: the decoded audio after noise reduction (D4), which works offline on the
 * whole decoded piece (margins included) BEFORE the node graph, wherever the effect sits in the list, with the
 * clip's profile (clipNoiseProfile) and its STFT frames on the source's own sample grid, so overlapping pieces of
 * every render agree. Several enabled noise-reduction effects act as one, their strengths summed (capped at 1).
 * Yields to the event loop while it works (denoiseBuffer).
 */
export async function prepareSource(clip: Clip, decoded: DecodedAudio, ctx: BaseAudioContext): Promise<AudioBuffer> {
  let strength = 0;
  for (const e of clip.audio.effects) if (e.enabled && e.type === 'denoise') strength += clampParams('denoise', e.params).strength;
  if (!(strength > 0)) return decoded.buffer;
  const profile = await clipNoiseProfile(clip, ctx);
  if (!profile) return decoded.buffer;
  return denoiseBuffer(decoded.buffer, Math.min(1, strength), Math.round(decoded.start * decoded.buffer.sampleRate), profile);
}
