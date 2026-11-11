// IndexedDB cache of waveform peaks (key `clipforge:peaks:<mediaId>`). A cache: every failure means "recompute".
import { del, get, set } from 'idb-keyval';
import type { Id } from '../core/model';

export const PEAKS_PER_SECOND = 100;

export interface Peaks {
  rate: number;
  duration: number;
  /** min,max pairs per bucket, 0..255 mapped from -1..1 (128 = silence). */
  data: Uint8Array;
}

export const peaksKey = (id: Id): string => `clipforge:peaks:${id}`;

const resident = new Map<Id, Peaks>();

export const rememberPeaks = (id: Id, p: Peaks): void => void resident.set(id, p);

const valid = (v: unknown): v is Peaks => {
  const p = v as Peaks | undefined;
  return !!p && p.rate === PEAKS_PER_SECOND && typeof p.duration === 'number' && p.data instanceof Uint8Array;
};

export async function loadPeaksCache(id: Id): Promise<Peaks | null> {
  const mem = resident.get(id);
  if (mem) return mem;
  if (typeof indexedDB === 'undefined') return null;
  try {
    const v = await get(peaksKey(id));
    return valid(v) ? v : null;
  } catch {
    return null;
  }
}

export async function savePeaksCache(id: Id, p: Peaks): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  try {
    await set(peaksKey(id), p);
  } catch {
    /* cache only */
  }
}

/** Forgets the media's peaks (memory and IndexedDB). Never throws. */
export async function deletePeaks(id: Id): Promise<void> {
  resident.delete(id);
  if (typeof indexedDB === 'undefined') return;
  try {
    await del(peaksKey(id));
  } catch {
    /* cache only */
  }
}
