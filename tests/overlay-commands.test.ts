// Overlay UI commands (Plan 4 Task 13): the add command picks a visible layer, is one undo step and selects the new
// clip; field commands are one step each; a locked track refuses with a toast; trimming and the on-canvas size.
import { beforeEach, describe, expect, it } from 'vitest';
import { clipDuration, newTrack } from '../src/core/model';
import type { Project } from '../src/core/model';
import { newOverlayClip, overlayBaseSize } from '../src/core/overlays';
import { trimClip } from '../src/core/timeline';
import { useEditor } from '../src/state/store';
import { useToasts } from '../src/ui/Toast';
import { addOverlayCmd, overlayTrackFor, updateOverlayCmd } from '../src/ui/overlayCommands';
import { overlayTarget, sourceSizeFor } from '../src/ui/overlayMath';
import { all, base, overlays, video } from './overlay-fixtures';

const state = () => useEditor.getState();
const depth = () => state().history.past.length;
const toasts = () => useToasts.getState().toasts.map((t) => t.message);
const present = () => state().history.present;
const withFlags = (p: Project, id: string, flags: object): Project => ({ ...p, tracks: p.tracks.map((t) => (t.id === id ? { ...t, ...flags } : t)) });
const twoLayers = (): Project => {
  const p = base();
  return { ...p, tracks: [p.tracks[0], { ...newTrack('video'), id: 'v2', clips: [] }, p.tracks[1]] };
};

beforeEach(() => {
  state().loadProject(base());
  useToasts.setState({ toasts: [] });
});

describe('addOverlayCmd', () => {
  it('adds one overlay at the playhead in ONE undo step and selects it', () => {
    state().loadProject(twoLayers());
    state().setPlayhead(1.5);
    state().setActiveTrack('v2');
    addOverlayCmd('subscribe');
    expect(depth()).toBe(1);
    const [o] = overlays(present());
    expect(o.start).toBe(1.5);
    expect(o.overlay?.type).toBe('subscribe');
    expect(present().tracks.find((t) => t.id === 'v2')!.clips).toHaveLength(1);
    expect(state().selection).toEqual([o.id]);
    state().undo();
    expect(overlays(present())).toHaveLength(0);
  });
  it('with no room on the active layer the core adds a new layer, still one step', () => {
    state().setActiveTrack('v');
    addOverlayCmd('lowerThird');
    expect(depth()).toBe(1);
    expect(present().tracks.filter((t) => t.kind === 'video')).toHaveLength(2);
  });
  it('a locked active layer refuses with a plain-English toast and no step', () => {
    state().loadProject(withFlags(base(), 'v', { locked: true }));
    state().setActiveTrack('v');
    addOverlayCmd('sticker');
    expect(depth()).toBe(0);
    expect(toasts()).toEqual(['Track is locked']);
  });
  it('prefers a visible layer when the active one is hidden, and hints when every layer is hidden', () => {
    const p = twoLayers();
    state().loadProject(withFlags(p, 'v2', { hidden: true }));
    state().setActiveTrack('v2');
    state().setPlayhead(10);
    addOverlayCmd('sticker');
    expect(present().tracks.find((t) => t.id === 'v')!.clips.some((c) => c.kind === 'overlay')).toBe(true);
    expect(toasts()).toEqual([]);
    state().loadProject(withFlags(withFlags(twoLayers(), 'v', { hidden: true }), 'v2', { hidden: true }));
    addOverlayCmd('sticker');
    expect(overlays(present())).toHaveLength(1);
    expect(toasts()[0]).toMatch(/hidden/i);
  });
});

describe('overlayTrackFor', () => {
  it('active visible video layer, else the topmost visible unlocked one, else the topmost visible, else any video', () => {
    const p = twoLayers();
    expect(overlayTrackFor(p, 'v')).toBe('v');
    expect(overlayTrackFor(p, 'nope')).toBe('v2');
    expect(overlayTrackFor(p, null)).toBe('v2');
    expect(overlayTrackFor(withFlags(p, 'v2', { hidden: true }), 'v2')).toBe('v');
    expect(overlayTrackFor(withFlags(p, 'v2', { locked: true }), null)).toBe('v');
    expect(overlayTrackFor(withFlags(withFlags(p, 'v', { locked: true }), 'v2', { locked: true }), null)).toBe('v2');
    expect(overlayTrackFor(withFlags(withFlags(p, 'v', { hidden: true }), 'v2', { hidden: true }), null)).toBe('v2');
    expect(overlayTrackFor({ ...p, tracks: [p.tracks[2]] }, null)).toBeNull();
  });
});

describe('updateOverlayCmd', () => {
  const setup = (locked = false): string => {
    state().loadProject(withFlags(base(), 'v', {}));
    addOverlayCmd('lowerThird');
    const id = overlays(present())[0].id;
    if (locked) state().apply((p) => withFlags(p, present().tracks.find((t) => t.clips.some((c) => c.id === id))!.id, { locked: true }));
    return id;
  };
  it('each change is one step; the same value adds none', () => {
    const id = setup();
    const d = depth();
    updateOverlayCmd(id, { text: 'Hello' });
    expect(depth()).toBe(d + 1);
    expect(overlays(present())[0].overlay?.text).toBe('Hello');
    updateOverlayCmd(id, { text: 'Hello' });
    expect(depth()).toBe(d + 1);
    updateOverlayCmd(id, { colour: '#112233' });
    expect(depth()).toBe(d + 2);
    state().undo();
    expect(overlays(present())[0].overlay?.colour).not.toBe('#112233');
  });
  it('a locked track refuses with the toast and no step', () => {
    const id = setup(true);
    const d = depth();
    updateOverlayCmd(id, { text: 'x' });
    expect(depth()).toBe(d);
    expect(toasts()).toEqual(['Track is locked']);
  });
});

describe('overlays on the canvas and in the timeline', () => {
  const f = { width: 1920, height: 1080 };
  it('sourceSizeFor gives an overlay its base size (needs the format)', () => {
    const c = newOverlayClip('lowerThird', 0, 5, f);
    expect(sourceSizeFor(c, undefined, undefined, f)).toEqual(overlayBaseSize('lowerThird', f));
    expect(sourceSizeFor(c, undefined)).toBeNull();
  });
  it('overlayTarget returns a selected overlay under the playhead', () => {
    state().setPlayhead(1);
    addOverlayCmd('sticker');
    const c = overlays(present())[0];
    const t = overlayTarget(present(), [c.id], 1);
    expect(t?.clip.id).toBe(c.id);
    expect(t?.size).toEqual(overlayBaseSize('sticker', present().format));
  });
  it('the start edge of an overlay can be trimmed earlier (the clip grows) and later (it shrinks)', () => {
    const p = base();
    const o = { ...newOverlayClip('sticker', 2, 3, p.format), id: 'o1' };
    const q = { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, clips: [video('c1', { out: 1 }), o] } : t)) };
    const earlier = trimClip(q, 'o1', 'start', 1.5);
    const e = all(earlier).find((c) => c.id === 'o1')!;
    expect([e.start, e.in, clipDuration(e)]).toEqual([1.5, 0, 3.5]);
    const later = all(trimClip(q, 'o1', 'start', 3)).find((c) => c.id === 'o1')!;
    expect([later.start, later.in, clipDuration(later)]).toEqual([3, 0, 2]);
    expect(() => trimClip(q, 'o1', 'start', -1)).toThrow();
  });
  it('trimming the start of the right half of a split overlay keeps the end and resets in to 0', () => {
    const p = base();
    const o = { ...newOverlayClip('sticker', 2, 4, p.format), id: 'o1', in: 1, out: 5 };
    const q = { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, clips: [video('c1', { out: 1 }), o] } : t)) };
    const r = all(trimClip(q, 'o1', 'start', 3)).find((c) => c.id === 'o1')!;
    expect([r.start, r.in, clipDuration(r)]).toEqual([3, 0, 3]);
  });
});
