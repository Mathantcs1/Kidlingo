import { describe, it, expect } from 'vitest';
import { newTrack } from '../src/core/model';
import type { Track, TrackKind } from '../src/core/model';
import { displayOrder, moveTarget, trackHeight } from '../src/ui/trackLayout';

const t = (kind: TrackKind, id: string): Track => ({ ...newTrack(kind), id });
const ids = (tracks: Track[]): string[] => tracks.map((x) => x.id);

describe('displayOrder', () => {
  it('shows video layers top layer first, then audio tracks in array order', () => {
    const tracks = [t('video', 'v1'), t('audio', 'a1'), t('video', 'v2'), t('audio', 'a2')];
    expect(ids(displayOrder(tracks))).toEqual(['v2', 'v1', 'a1', 'a2']);
  });

  it('handles 2 video + 1 audio interleaved', () => {
    expect(ids(displayOrder([t('video', 'v1'), t('audio', 'a1'), t('video', 'v2')]))).toEqual(['v2', 'v1', 'a1']);
  });

  it('is stable (same input, same output) and does not mutate its input', () => {
    const tracks = [t('video', 'v1'), t('video', 'v2'), t('audio', 'a1')];
    const copy = [...tracks];
    expect(ids(displayOrder(tracks))).toEqual(ids(displayOrder(tracks)));
    expect(tracks).toEqual(copy);
    expect(displayOrder(tracks)[0]).toBe(tracks[1]);
  });

  it('is empty for no tracks', () => {
    expect(displayOrder([])).toEqual([]);
  });
});

describe('trackHeight', () => {
  it('is 56 px for video and 40 px for audio', () => {
    expect(trackHeight('video')).toBe(56);
    expect(trackHeight('audio')).toBe(40);
  });
});

describe('moveTarget', () => {
  // Array: v1 (bottom layer), a1, v2, v3 (top layer), a2
  const tracks = [t('video', 'v1'), t('audio', 'a1'), t('video', 'v2'), t('video', 'v3'), t('audio', 'a2')];

  it('moves a video layer up to the next higher video layer (higher array index), skipping audio', () => {
    expect(moveTarget(tracks, 'v1', 'up')).toBe(2);
    expect(moveTarget(tracks, 'v2', 'up')).toBe(3);
  });

  it('moves a video layer down to the next lower video layer', () => {
    expect(moveTarget(tracks, 'v3', 'down')).toBe(2);
    expect(moveTarget(tracks, 'v2', 'down')).toBe(0);
  });

  it('returns null at the video edges', () => {
    expect(moveTarget(tracks, 'v3', 'up')).toBeNull();
    expect(moveTarget(tracks, 'v1', 'down')).toBeNull();
  });

  it('moves audio tracks the other way round (up = lower array index)', () => {
    expect(moveTarget(tracks, 'a2', 'up')).toBe(1);
    expect(moveTarget(tracks, 'a1', 'down')).toBe(4);
    expect(moveTarget(tracks, 'a1', 'up')).toBeNull();
    expect(moveTarget(tracks, 'a2', 'down')).toBeNull();
  });

  it('returns null for a single track of a kind and for an unknown id', () => {
    const two = [t('video', 'v'), t('audio', 'a')];
    expect(moveTarget(two, 'v', 'up')).toBeNull();
    expect(moveTarget(two, 'a', 'down')).toBeNull();
    expect(moveTarget(two, 'nope', 'up')).toBeNull();
  });
});
