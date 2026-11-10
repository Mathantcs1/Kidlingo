import { describe, it, expect } from 'vitest';
import { visualClipsAt } from '../src/render/visible';
import { emptyProject, newTrack } from '../src/core/model';
import type { Clip, Project, Track } from '../src/core/model';

let seq = 0;
function clip(kind: Clip['kind'], start: number, len: number): Clip {
  return {
    id: `c${++seq}`,
    mediaId: `m${seq}`,
    kind,
    start,
    in: 0,
    out: len,
    volume: 1,
    fit: 'fit',
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
  };
}

function track(kind: Track['kind'], clips: Clip[], over: Partial<Track> = {}): Track {
  return { ...newTrack(kind), clips, ...over };
}

function projectOf(tracks: Track[]): Project {
  return { ...emptyProject(), tracks };
}

describe('visualClipsAt', () => {
  it('returns active video and image clips of video tracks, bottom track first', () => {
    const bottom = clip('video', 0, 5);
    const middle = clip('image', 1, 5);
    const top = clip('video', 0, 2);
    const music = clip('audio', 0, 5);
    const audioOnVideo = clip('audio', 0, 5);
    const p = projectOf([
      track('video', [bottom]),
      track('audio', [music]),
      track('video', [middle, audioOnVideo]),
      track('video', [top]),
    ]);
    expect(visualClipsAt(p, 1.5).map((c) => c.id)).toEqual([bottom.id, middle.id, top.id]);
    expect(visualClipsAt(p, 3).map((c) => c.id)).toEqual([bottom.id, middle.id]);
    expect(visualClipsAt(p, 6)).toEqual([]);
  });

  it('skips clips on hidden video tracks and keeps the order of the others', () => {
    const a = clip('video', 0, 5);
    const b = clip('image', 0, 5);
    const c = clip('video', 0, 5);
    const p = projectOf([track('video', [a]), track('video', [b], { hidden: true }), track('video', [c])]);
    expect(visualClipsAt(p, 1).map((x) => x.id)).toEqual([a.id, c.id]);
    const allHidden = projectOf(p.tracks.map((t) => ({ ...t, hidden: true })));
    expect(visualClipsAt(allHidden, 1)).toEqual([]);
  });

  it('ignores the hidden flag of audio tracks and clips on audio tracks', () => {
    const v = clip('video', 0, 5);
    const onAudio = clip('video', 0, 5);
    const p = projectOf([track('video', [v]), track('audio', [onAudio], { hidden: true })]);
    expect(visualClipsAt(p, 1).map((x) => x.id)).toEqual([v.id]);
  });

  it('is half-open: a clip is active from its start up to (not including) its end', () => {
    const v = clip('video', 2, 1);
    const p = projectOf([track('video', [v])]);
    expect(visualClipsAt(p, 2)).toHaveLength(1);
    expect(visualClipsAt(p, 3)).toHaveLength(0);
    expect(visualClipsAt(p, 1.999)).toHaveLength(0);
  });
});
