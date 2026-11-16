// Plan 5C final-review fix wave: I1 (an audio tile must not poison "+"), M1 (no-op returns the same project), M2 (merge-all leaves no
// stale transitions), M3 (merge report sorted by start), M4 (fps adoption reconciles), M6 (extra layers freed), M8 (fade note),
// M10 (D10 times).
import { beforeEach, describe, expect, it } from 'vitest';
import { defaultClipAudio } from '../src/core/model';
import { adoptFirstClipFps } from '../src/core/fps';
import { addClip } from '../src/core/timeline';
import { addTransition, setTransition } from '../src/core/transitionEdits';
import { fadeReplaced } from '../src/ui/fadeReplaced';
import { replaceWithMedia } from '../src/ui/edits';
import { extrasToFree } from '../src/render/compositeBuffer';
import { transitionResolveTimes } from '../src/render/drawCollectTransition';
import { addTransitionAtPlayheadCmd, addTransitionCmd, mergeSelectedWithTransitionCmd, setLastTransitionSpec } from '../src/ui/transitionCommands';
import { useToasts } from '../src/ui/Toast';
import { useEditor } from '../src/state/store';
import { base, mk, trackOf } from './transition-fixtures';
import type { Project } from '../src/core/model';

const state = () => useEditor.getState();
const trs = (p: Project, id = 'v') => trackOf(p, id).transitions ?? [];

beforeEach(() => {
  setLastTransitionSpec({ type: 'dissolve', duration: 1 });
  useToasts.setState({ toasts: [] });
});

describe('I1: the last spec never carries an audio type onto a video cut', () => {
  it('a refused audio tile followed by "+" on a video cut still adds a picture transition', () => {
    state().loadProject(base());
    addTransitionAtPlayheadCmd('audio'); // no audio cut: refused
    addTransitionCmd('v', 'a', 'b');
    expect(trs(state().history.present)).toHaveLength(1);
    expect(trs(state().history.present)[0].type).toBe('dissolve');
  });
});

describe('I1 (defence): an audio last spec is read as a dissolve on a video cut', () => {
  it('"+" with an audio last spec adds a dissolve', () => {
    state().loadProject(base());
    setLastTransitionSpec({ type: 'audio', duration: 0.6 });
    addTransitionCmd('v', 'a', 'b');
    expect(trs(state().history.present)[0].type).toBe('dissolve');
  });
});

describe('M1: setTransition with equal values is a no-op', () => {
  it('re-setting the same direction on a wipe with an audio law returns the same project', () => {
    const p = addTransition(base(), 'v', 'a', 'b', { type: 'wipe', audio: 'gain' });
    const id = trs(p)[0].id;
    expect(setTransition(p, id, { direction: 'left' })).toBe(p);
    expect(setTransition(p, id, { softness: 0.05 })).toBe(p);
  });
});

describe('M2: merge-all leaves no stale transitions', () => {
  it('replaceWithMedia clears the transitions with the clips', () => {
    const p = addTransition(base(), 'v', 'a', 'b', { type: 'dissolve' });
    const q = replaceWithMedia(p, { id: 'm2', name: 'm.mp4', kind: 'video', duration: 5, width: 1920, height: 1080, hasAudio: true });
    expect(q.tracks.flatMap((t) => t.transitions ?? [])).toHaveLength(0);
  });
});

describe('M3: the merge report does not depend on the click order', () => {
  it('selecting the later clip first gives the same toast', () => {
    const toastFor = (ids: string[]): string => {
      state().loadProject(base([mk('a', 0, 0, 4), mk('b', 10, 2, 6)]));
      useToasts.setState({ toasts: [] });
      state().select(ids);
      mergeSelectedWithTransitionCmd();
      return JSON.stringify(useToasts.getState().toasts.map((t) => t.message));
    };
    expect(toastFor(['b', 'a'])).toBe(toastFor(['a', 'b']));
  });
});

describe('M4: adopting a new frame rate reconciles audio-track transitions', () => {
  it('a 0.6 s crossfade (18 frames at 30) does not survive as 15 odd frames at 25', () => {
    const p = base([]);
    const audio = (id: string, start: number, inn: number, out: number) => mk(id, start, inn, out, { kind: 'audio', audio: defaultClipAudio() });
    p.media.m1 = { id: 'm1', name: 'a.wav', kind: 'audio', duration: 60, hasAudio: true } as never;
    p.media.mv = { id: 'mv', name: 'v.mp4', kind: 'video', duration: 10, width: 640, height: 360, hasAudio: false, fps: 25 } as never;
    const at = p.tracks.findIndex((t) => t.kind === 'audio');
    p.tracks[at] = { ...p.tracks[at], id: 'a1', clips: [audio('x', 0, 2, 6), audio('y', 4, 2, 6)] };
    const t = addTransition(p, 'a1', 'x', 'y', { type: 'audio', duration: 0.6 });
    expect(trs(t, 'a1')[0].duration).toBeCloseTo(0.6, 9);
    const q = addClip(t, 'v', mk('n', 0, 0, 2, { mediaId: 'mv' }));
    expect(q.format.fps).toBe(25);
    for (const x of trs(q, 'a1')) expect(Math.round(x.duration * 25) % 2).toBe(0);
    expect(adoptFirstClipFps(t, mk('n', 0, 0, 2, { mediaId: 'mv' })).format.fps).toBe(25);
  });
});

describe('M6: layers the frame does not need are freed', () => {
  it('3 targets free both extras, 4 keep layer B only, 5 keep both', () => {
    expect(extrasToFree(3)).toEqual({ layerB: true, scratch: true });
    expect(extrasToFree(4)).toEqual({ layerB: false, scratch: true });
    expect(extrasToFree(5)).toEqual({ layerB: false, scratch: false });
  });
});

describe('M8: the "fade replaced" note needs both clips to sound', () => {
  it('replaced between two video clips with audio; not next to an image', () => {
    const faded = base().tracks[0].clips.map((c) => ({ ...c, audio: { ...c.audio, fadeIn: 0.3, fadeOut: 0.3 } }));
    const p = addTransition(base(faded), 'v', 'a', 'b', { type: 'dissolve' });
    const a = trackOf(p).clips[0];
    expect(fadeReplaced(p, a)).toBe('out');
    expect(fadeReplaced(p, trackOf(p).clips[1])).toBe('in');
    const q = { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, clips: t.clips.map((c) => (c.id === 'b' ? { ...c, audio: { ...c.audio, silent: true } } : c)) } : t)) };
    expect(fadeReplaced(q, trackOf(q).clips[0])).toBe('');
  });
});

describe('M10 (D10): handle draws resolve the animation at the edge frame, not at t', () => {
  it('a time inside the incoming handle resolves at the clip start; inside the outgoing handle at its last frame', () => {
    const p = addTransition(base(), 'v', 'a', 'b', { type: 'dissolve' });
    const [a, b] = trackOf(p).clips;
    const fps = p.format.fps;
    const early = transitionResolveTimes(a, b, 3.8, fps); // 3.8 < b.start (4): b is in its pre-in handle
    expect(early.to).toBeCloseTo(4, 9);
    expect(early.from).toBeCloseTo(3.8, 9);
    const late = transitionResolveTimes(a, b, 4.2, fps); // a is past its end
    expect(late.from).toBeCloseTo(4 - 1 / fps, 9);
    expect(late.to).toBeCloseTo(4.2, 9);
  });
});
