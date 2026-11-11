// A LUT file is media referenced by effects (Plan 4 Task 6): in-use counting, removal refusal, GC protection, file kind.
import { describe, expect, it } from 'vitest';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project, VideoEffect } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';
import { classifyFile } from '../src/media/fileKind';
import { referencedMedia, unusedMedia } from '../src/media/gc';
import { commit, createHistory } from '../src/state/history';
import { clipsUsingMedia, removeMediaFromProject, usedByText } from '../src/ui/edits';

const video: MediaRef = { id: 'v', name: 'v.mp4', kind: 'video', duration: 10, width: 64, height: 64, fps: 30, hasAudio: false };
const lut: MediaRef = { id: 'L', name: 'Warm.cube', kind: 'lut', duration: 0, hasAudio: false };
const lutFx = (ref: string, enabled = true): VideoEffect => ({ id: `fx-${ref}-${enabled}`, type: 'lut', enabled, params: { intensity: 1 }, ref });

const clip = (id: string, effects: VideoEffect[] = []): Clip => ({
  id, mediaId: 'v', kind: 'video', start: 0, in: 0, out: 1, transform: defaultTransform(), volume: 1,
  audio: defaultClipAudio(), effects, blend: 'normal', fit: 'fit',
});

function project(clips: Clip[]): Project {
  const p = emptyProject('vertical');
  return { ...p, media: { v: video, L: lut }, tracks: p.tracks.map((t, i) => (i === 0 ? { ...t, clips } : t)) };
}

describe('a LUT used by clip effects', () => {
  it('counts every clip whose effect stack references it (disabled effects too, once per clip)', () => {
    expect(clipsUsingMedia(project([clip('a')]), 'L')).toBe(0);
    expect(clipsUsingMedia(project([clip('a', [lutFx('L')]), clip('b', [lutFx('L', false), lutFx('L')])]), 'L')).toBe(2);
    expect(clipsUsingMedia(project([clip('a', [lutFx('L')])]), 'v')).toBe(1);
  });

  it('cannot be removed while a clip uses it (the in-use message), and nothing changes', () => {
    const p = project([clip('a', [lutFx('L')]), clip('b', [lutFx('L')])]);
    expect(() => removeMediaFromProject(p, 'L')).toThrow(TimelineError);
    expect(() => removeMediaFromProject(p, 'L')).toThrow(`Cannot remove Warm.cube. ${usedByText(2)}`);
    expect(usedByText(1)).toBe('It is used by 1 clip on the timeline.');
    expect(usedByText(2)).toBe('It is used by 2 clips on the timeline.');
  });

  it('can be removed once no clip uses it; removing it never removes video clips', () => {
    const p = project([clip('a')]);
    const q = removeMediaFromProject(p, 'L');
    expect(q.media.L).toBeUndefined();
    expect(q.tracks[0].clips.map((c) => c.id)).toEqual(['a']);
  });

  it('is protected by GC while any history state lists it, and effect refs count as references', () => {
    let h = createHistory(project([clip('a', [lutFx('L')])]));
    expect(referencedMedia(h).has('L')).toBe(true);
    // A state whose media table lost the LUT but a clip still references it (hand-edited save): still protected.
    const dangling = { ...project([clip('a', [lutFx('L')])]), media: { v: video } };
    h = createHistory(dangling);
    expect(referencedMedia(h).has('L')).toBe(true);
    expect(unusedMedia(['v', 'L', 'x'], referencedMedia(h), new Set())).toEqual(['x']);
    h = commit(createHistory(project([clip('a')])), { ...project([]), media: {} });
    expect(referencedMedia(h).has('L')).toBe(true);
  });
});

describe('classifyFile', () => {
  it('names .cube files as LUTs (by extension, any case)', () => {
    expect(classifyFile('Warm.cube', '')).toEqual({ kind: 'lut' });
    expect(classifyFile('WARM.CUBE', 'application/octet-stream')).toEqual({ kind: 'lut' });
    expect(classifyFile('x.cube', 'text/plain')).toEqual({ kind: 'lut' });
  });
});
