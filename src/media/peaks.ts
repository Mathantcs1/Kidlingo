// Waveform peaks: per-bucket (min, max) pairs at PEAKS_PER_SECOND, built by streaming so memory stays bounded.
import { ALL_FORMATS, AudioSampleSink, BlobSource, Input } from 'mediabunny';
import type { Id } from '../core/model';
import { loadPeaksCache, rememberPeaks, savePeaksCache, type Peaks } from './peaksStore';
import { getMediaFile } from './storage';

export { PEAKS_PER_SECOND, deletePeaks } from './peaksStore';
export type { Peaks } from './peaksStore';

const RATE = 100;

/** Running state of a streaming peak computation (mono samples in order). */
export interface PeakAccumulator {
  sampleRate: number;
  samples: number;
  mins: number[];
  maxs: number[];
  curMin: number;
  curMax: number;
  curBucket: number;
}

export function newAccumulator(): PeakAccumulator {
  return { sampleRate: 0, samples: 0, mins: [], maxs: [], curMin: 0, curMax: 0, curBucket: -1 };
}

const quantize = (v: number): number => Math.max(0, Math.min(255, Math.round(v * 127.5 + 127.5)));
const dequantize = (q: number): number => Math.max(-1, Math.min(1, (q - 128) / 127));

function closeBucket(acc: PeakAccumulator): void {
  if (acc.curBucket < 0) return;
  acc.mins.push(acc.curMin);
  acc.maxs.push(acc.curMax);
}

/** Feeds the next consecutive mono samples (any chunking gives the same result). */
export function accumulatePeaks(acc: PeakAccumulator, samples: Float32Array, sampleRate: number): void {
  if (!(sampleRate > 0)) return;
  acc.sampleRate = sampleRate;
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i];
    const bucket = Math.floor((acc.samples * RATE) / sampleRate);
    if (bucket !== acc.curBucket) {
      closeBucket(acc);
      acc.curBucket = bucket;
      acc.curMin = v;
      acc.curMax = v;
    } else {
      if (v < acc.curMin) acc.curMin = v;
      if (v > acc.curMax) acc.curMax = v;
    }
    acc.samples++;
  }
}

export function finishPeaks(acc: PeakAccumulator): Peaks {
  if (acc.samples === 0) return { rate: RATE, duration: 0, data: new Uint8Array(0) };
  const mins = [...acc.mins, acc.curMin];
  const maxs = [...acc.maxs, acc.curMax];
  const data = new Uint8Array(mins.length * 2);
  for (let i = 0; i < mins.length; i++) {
    data[i * 2] = quantize(Number.isFinite(mins[i]) ? mins[i] : 0);
    data[i * 2 + 1] = quantize(Number.isFinite(maxs[i]) ? maxs[i] : 0);
  }
  return { rate: RATE, duration: acc.samples / acc.sampleRate, data };
}

/** Min and max (-1..1) over source seconds [from, to); {0, 0} when the range holds no data. */
export function peakAt(peaks: Peaks, from: number, to: number): { min: number; max: number } {
  const count = peaks.data.length / 2;
  const first = Math.max(0, Math.floor(from * peaks.rate));
  const last = Math.min(count - 1, Math.max(first, Math.ceil(to * peaks.rate) - 1));
  if (count === 0 || first > last) return { min: 0, max: 0 };
  let min = 255;
  let max = 0;
  for (let b = first; b <= last; b++) {
    if (peaks.data[b * 2] < min) min = peaks.data[b * 2];
    if (peaks.data[b * 2 + 1] > max) max = peaks.data[b * 2 + 1];
  }
  return { min: dequantize(min), max: dequantize(max) };
}

let decodes = 0;
/** How many times peaks were computed by decoding (cache hits do not count). Dev-hook counter for the e2e. */
export const peaksDecodeCount = (): number => decodes;

async function computePeaks(mediaId: Id): Promise<Peaks | null> {
  const input = new Input({ source: new BlobSource(await getMediaFile(mediaId)), formats: ALL_FORMATS });
  try {
    const track = await input.getPrimaryAudioTrack();
    if (!track) return null;
    decodes++;
    const acc = newAccumulator();
    let planes: Float32Array[] = [];
    let mono = new Float32Array(0);
    for await (const sample of new AudioSampleSink(track).samples()) {
      try {
        const frames = sample.numberOfFrames;
        const channels = sample.numberOfChannels;
        if (mono.length < frames) mono = new Float32Array(frames);
        while (planes.length < channels) planes.push(new Float32Array(0));
        planes = planes.map((p) => (p.length < frames ? new Float32Array(frames) : p));
        for (let c = 0; c < channels; c++) {
          sample.copyTo(planes[c].subarray(0, frames), { planeIndex: c, format: 'f32-planar' });
        }
        for (let i = 0; i < frames; i++) {
          let best = planes[0][i];
          for (let c = 1; c < channels; c++) if (Math.abs(planes[c][i]) > Math.abs(best)) best = planes[c][i];
          mono[i] = best;
        }
        accumulatePeaks(acc, mono.subarray(0, frames), sample.sampleRate);
      } finally {
        sample.close();
      }
    }
    return finishPeaks(acc);
  } finally {
    input.dispose();
  }
}

const inflight = new Map<Id, Promise<Peaks | null>>();

/** Cached peaks (memory, then IndexedDB) or computed by streaming the decode and stored. Null: no audio / failed. */
export function getPeaks(mediaId: Id): Promise<Peaks | null> {
  let p = inflight.get(mediaId);
  if (!p) {
    p = (async () => {
      const cached = await loadPeaksCache(mediaId);
      if (cached) return cached;
      const fresh = await computePeaks(mediaId).catch(() => null);
      if (fresh) await savePeaksCache(mediaId, fresh);
      return fresh;
    })().then((r) => {
      if (r) rememberPeaks(mediaId, r);
      inflight.delete(mediaId);
      return r;
    }, () => {
      inflight.delete(mediaId);
      return null;
    });
    inflight.set(mediaId, p);
  }
  return p;
}
