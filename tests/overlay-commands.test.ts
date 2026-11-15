import { describe, it, expect, beforeEach } from 'vitest';
import { emptyProject, newTrack } from '../src/core/model';
import type { Project } from '../src/core/model';
import { useEditor } from '../src/state/store';
import { useToasts } from '../src/ui/Toast';
import { addOverlayAtPlayhead, updateOverlayClip } from '../src/ui/overlayCommands';

const state = () => useEditor.getState();
const depth = (): number => state().history.past.length;
const overlays = () => state().history.present.tracks.flatMap((t) => t.clips).filter((c) => c.kind === 'overlay');
const toasts = (): string[] => useToasts.getState().toasts.map((t) => t.message);

beforeEach(() => {
  state().loadProject(emptyProject());
  state().setPlayhead(2.5);
  useToasts.setState({ toasts: [] });
});

describe('addOverlayAtPlayhead', () => {
  it('adds the overlay at the playhead in ONE undo step and selects it', () => {
    const d0 = depth();
    addOverlayAtPlayhead('lowerThird');
    expect(depth()).toBe(d0 + 1);
    const [c] = overlays();
    expect(c.start).toBe(2.5);
    expect(state().selection).toEqual([c.id]);
    state().undo();
    expect(overlays()).toHaveLength(0);
  });

  it('a sticker gets its shape in the same undo step', () => {
    const d0 = depth();
    addOverlayAtPlayhead('sticker', 5);
    expect(depth()).toBe(d0 + 1);
    expect(overlays()[0].overlay!.params.shape).toBe(5);
  });

  it('goes to the active video track when it is free', () => {
    const p = state().history.present;
    const second = newTrack('video');
    state().loadProject({ ...p, tracks: [p.tracks[0], second, p.tracks[1]] });
    state().setActiveTrack(second.id);
    addOverlayAtPlayhead('subscribe');
    expect(state().history.present.tracks.find((t) => t.id === second.id)!.clips).toHaveLength(1);
  });

  it('refuses with a toast when every video track is full and locked, and changes nothing', () => {
    const p = emptyProject();
    const videos = Array.from({ length: 8 }, () => ({ ...newTrack('video'), locked: true }));
    state().loadProject({ ...p, tracks: [...videos, p.tracks[1]] } as Project);
    state().setPlayhead(1);
    const d0 = depth();
    addOverlayAtPlayhead('sticker');
    expect(toasts()[0]).toMatch(/At most 8/);
    expect(depth()).toBe(d0);
  });
});

describe('updateOverlayClip', () => {
  it('is one undo step per change; refusals become toasts', () => {
    addOverlayAtPlayhead('lowerThird');
    const id = overlays()[0].id;
    const d0 = depth();
    updateOverlayClip(id, { text: 'Hello' });
    updateOverlayClip(id, { params: { corner: 0.9 } });
    expect(depth()).toBe(d0 + 2);
    expect(overlays()[0].overlay!.text).toBe('Hello');
    updateOverlayClip(id, { text: 'Hello' });
    expect(depth()).toBe(d0 + 2);
    updateOverlayClip('nope', { text: 'x' });
    expect(toasts()).toHaveLength(1);
  });
});
