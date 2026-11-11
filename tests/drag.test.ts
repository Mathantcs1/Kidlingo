import { describe, it, expect } from 'vitest';
import {
  DRAG_THRESHOLD_PX,
  SNAP_PX,
  dropStart,
  laneRejects,
  moveTarget,
  pastThreshold,
  snapSeconds,
  snapSpan,
  trimTarget,
  withoutClip,
} from '../src/ui/drag';
import { defaultClipAudio, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project } from '../src/core/model';

const video: MediaRef = { id: 'v', name: 'v.mp4', kind: 'video', duration: 3, width: 640, height: 360, hasAudio: true };
const image: MediaRef = { id: 'i', name: 'i.png', kind: 'image', duration: 5, width: 100, height: 100, hasAudio: false };

function clip(id: string, start: number, inT: number, out: number, mediaId = 'v'): Clip {
  return {
    id,
    mediaId,
    kind: mediaId === 'i' ? 'image' : 'video',
    start,
    in: inT,
    out,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    volume: 1,
    audio: defaultClipAudio(),
    fit: 'fit',
  };
}

/** Video track: a [0,3) and b [5,7) (b uses source 1..3). */
function project(): Project {
  const p = emptyProject('youtube');
  p.media = { v: video, i: image };
  p.tracks[0].clips = [clip('a', 0, 0, 3), clip('b', 5, 1, 3)];
  return p;
}

const PPS = 60;
const TH = SNAP_PX / PPS;

describe('drag threshold', () => {
  it('starts a drag only after 4 px of movement', () => {
    expect(DRAG_THRESHOLD_PX).toBe(4);
    expect(pastThreshold(0, 0)).toBe(false);
    expect(pastThreshold(3, 0)).toBe(false);
    expect(pastThreshold(2, 2)).toBe(false);
    expect(pastThreshold(4, 0)).toBe(true);
    expect(pastThreshold(-3, -3)).toBe(true);
    expect(pastThreshold(Number.NaN, 10)).toBe(false);
  });
});

describe('snapSeconds', () => {
  it('converts the 8 px snap distance to seconds', () => {
    expect(snapSeconds(60)).toBeCloseTo(8 / 60);
    expect(snapSeconds(0)).toBe(0);
    expect(snapSeconds(-5)).toBe(0);
    expect(snapSeconds(Number.NaN)).toBe(0);
  });
});

describe('snapSpan', () => {
  it('snaps either edge of a span to the nearest edge within the threshold', () => {
    const p = project();
    expect(snapSpan(p, 3.05, 1, TH)).toBe(3); // start → a's end
    expect(snapSpan(p, 3.95, 1, TH)).toBe(4); // end 4.95 → b's start 5
    expect(snapSpan(p, 3.5, 1, TH)).toBe(3.5); // nothing near
    expect(snapSpan(p, 0.1, 1, TH)).toBe(0); // start → 0
  });

  it('never returns a negative or invalid start', () => {
    const p = project();
    expect(snapSpan(p, -2, 1, TH)).toBe(0);
    expect(snapSpan(p, Number.NaN, 1, TH)).toBe(0);
    expect(snapSpan(p, 1e9, 1, TH)).toBe(1e9);
  });
});

describe('withoutClip', () => {
  it('removes only that clip', () => {
    const p = withoutClip(project(), 'a');
    expect(p.tracks[0].clips.map((c) => c.id)).toEqual(['b']);
    expect(withoutClip(project(), 'nope').tracks[0].clips).toHaveLength(2);
  });
});

describe('moveTarget', () => {
  it('moves by the pointer delta and snaps to other clips but not to itself', () => {
    const p = project();
    expect(moveTarget(p, 'a', 90, PPS)).toBeCloseTo(1.5);
    // a is 3 s long: end 3+1.95=4.95 snaps to b at 5 → start 2.
    expect(moveTarget(p, 'a', 117, PPS)).toBeCloseTo(2);
    // A tiny move would snap to a's own old position if a were not excluded.
    expect(moveTarget(p, 'b', -30, PPS)).toBeCloseTo(4.5);
    expect(moveTarget(p, 'b', -125, PPS)).toBe(3); // start 2.9167 → a's end
  });

  it('clamps at 0 and survives bad input', () => {
    const p = project();
    expect(moveTarget(p, 'b', -10000, PPS)).toBe(0);
    expect(moveTarget(p, 'b', Number.NaN, PPS)).toBe(5);
    expect(moveTarget(p, 'b', 60, 0)).toBe(5);
  });
});

describe('trimTarget', () => {
  it('moves the edge by the pointer delta and snaps to other edges', () => {
    const p = project();
    expect(trimTarget(p, 'a', 'end', -60, PPS)).toBeCloseTo(2);
    expect(trimTarget(p, 'a', 'start', 30, PPS)).toBeCloseTo(0.5);
    // b's start 5 dragged left to 3.1 snaps to a's end 3.
    expect(trimTarget(p, 'b', 'start', -114, PPS)).toBe(3);
  });

  it('caps an end trim at the end of the source media, except for images', () => {
    const p = project();
    // b plays source 1..3 from 5; its source ends at 5 + (3 - 1) = 7.
    expect(trimTarget(p, 'b', 'end', 120, PPS)).toBe(7);
    p.tracks[0].clips.push(clip('img', 10, 0, 5, 'i'));
    expect(trimTarget(p, 'img', 'end', 120, PPS)).toBeCloseTo(17);
  });

  it('does not clamp below the clip start (the core rejects that) and ignores bad input', () => {
    const p = project();
    expect(trimTarget(p, 'a', 'end', -600, PPS)).toBeCloseTo(-7);
    expect(trimTarget(p, 'a', 'start', -60, PPS)).toBeCloseTo(-1);
    expect(trimTarget(p, 'a', 'end', Number.NaN, PPS)).toBe(3);
    expect(trimTarget(p, 'a', 'end', 60, Number.NaN)).toBe(3);
  });
});

describe('dropStart', () => {
  it('places a dropped span at the pointer, snapped', () => {
    const p = project();
    expect(dropStart(p, 450, PPS, 1)).toBeCloseTo(7.5);
    expect(dropStart(p, 125, PPS, 1)).toBeCloseTo(2); // its end 3.083 snaps to a's end 3
    expect(dropStart(p, 305, PPS, 1)).toBe(5); // start 5.083 snaps to b's start
    expect(dropStart(p, -40, PPS, 1)).toBe(0);
    expect(dropStart(p, Number.NaN, PPS, 1)).toBe(0);
  });
});

describe('laneRejects', () => {
  it('keeps audio on audio lanes and pictures on video lanes', () => {
    expect(laneRejects('video', 'video')).toBeNull();
    expect(laneRejects('video', 'image')).toBeNull();
    expect(laneRejects('audio', 'audio')).toBeNull();
    expect(laneRejects('video', 'audio')).toBe('Audio goes on an audio track');
    expect(laneRejects('audio', 'video')).toBe('Video and images go on a video track');
    expect(laneRejects('audio', 'image')).toBe('Video and images go on a video track');
  });
});
