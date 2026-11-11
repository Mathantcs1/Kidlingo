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

async function estimate(clip: Clip, ctx: BaseAudioContext): Promise<ChannelNoise[] | null> {
  const probes: Float32Array[][] = [];
  for (const [from, to] of profileProbes(clip.in, clip.out)) {
    // No abort signal: the estimate is shared by every caller; each checks its own signal after awaiting it.
    const d = await decodeAudioRange(clip.mediaId, from, to, ctx);
    if (!d) continue;
    for (let c = 0; c < d.buffer.numberOfChannels; c++) (probes[c] ??= []).push(d.buffer.getChannelData(c));
  }
  return probes.length ? probes.map((p) => estimateNoise(p)) : null;
}

/**
 * The noise profile (one ChannelNoise per source channel) of the clip's [in, out) source range, or null when it
 * has no audio there. Depends only on the media and that range, never on the render window.
 */
export function clipNoiseProfile(clip: Clip, ctx: BaseAudioContext): Promise<ChannelNoise[] | null> {
  const key = `${clip.mediaId}|${clip.in}|${clip.out}`;
  let p = cache.get(key);
  if (!p) {
    p = estimate(clip, ctx);
    cache.set(key, p);
    p.catch(() => cache.delete(key));
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
