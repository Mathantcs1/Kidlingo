import { describe, it, expect, beforeEach, vi } from 'vitest';
import { defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { addClip } from '../src/core/timeline';
import { useEditor } from '../src/state/store';
import { useToasts } from '../src/ui/Toast';

const confirm = vi.hoisted(() => ({ answer: true, asked: [] as string[] }));
vi.mock('../src/ui/Confirm', () => ({
  askConfirm: (req: { title: string }) => {
    confirm.asked.push(req.title);
    return Promise.resolve(confirm.answer);
  },
}));

const { addLayer, moveLayer, removeLayer, renameLayer, toggleTrackFlag } = await import('../src/ui/trackCommands');

const clip = (id: string, start = 0): Clip => ({
  id,
  mediaId: 'm1',
  kind: 'video',
  start,
  in: 0,
  out: 2,
  transform: defaultTransform(),
  volume: 1,
  fit: 'fit',
});

const s = () => useEditor.getState();
const present = (): Project => s().history.present;
const depth = (): number => s().history.past.length;
const toasts = (): string[] => useToasts.getState().toasts.map((x) => x.message);

beforeEach(() => {
  s().loadProject(emptyProject());
  useToasts.setState({ toasts: [] });
  confirm.answer = true;
  confirm.asked = [];
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

describe('track commands', () => {
  it('addLayer adds a track in one undo step and makes it the active track', () => {
    addLayer('video');
    expect(depth()).toBe(1);
    const videos = present().tracks.filter((t) => t.kind === 'video');
    expect(videos).toHaveLength(2);
    expect(s().activeTrackId).toBe(videos[1].id);
    addLayer('audio');
    const audio = present().tracks.filter((t) => t.kind === 'audio');
    expect(s().activeTrackId).toBe(audio[1].id);
  });

  it('addLayer past the limit shows a toast and adds nothing', () => {
    for (let i = 0; i < 7; i++) addLayer('video');
    const before = present();
    addLayer('video');
    expect(present()).toBe(before);
    expect(toasts().at(-1)).toMatch(/At most 8 video/);
  });

  it('toggleTrackFlag flips one flag per undo step', () => {
    const id = present().tracks[0].id;
    toggleTrackFlag(id, 'muted');
    expect(present().tracks[0].muted).toBe(true);
    toggleTrackFlag(id, 'muted');
    expect(present().tracks[0].muted).toBe(false);
    expect(depth()).toBe(2);
    s().undo();
    expect(present().tracks[0].muted).toBe(true);
  });

  it('renameLayer renames in one step; empty falls back to the default label', () => {
    const id = present().tracks[0].id;
    renameLayer(id, '  Titles ');
    expect(present().tracks[0].name).toBe('Titles');
    renameLayer(id, '');
    expect(present().tracks[0].name).toBe('');
    expect(depth()).toBe(2);
  });

  it('moveLayer swaps with the neighbouring track of the same kind; at the edge it does nothing', () => {
    addLayer('video');
    const [v1, v2] = present().tracks; // [v1, v2 (new, top layer), a1]
    moveLayer(v2.id, 'up');
    expect(depth()).toBe(1);
    moveLayer(v1.id, 'up');
    expect(present().tracks.filter((t) => t.kind === 'video').map((t) => t.id)).toEqual([v2.id, v1.id]);
    expect(depth()).toBe(2);
  });

  it('removeLayer removes an empty track without asking', async () => {
    addLayer('video');
    const id = present().tracks[1].id;
    await removeLayer(id);
    expect(confirm.asked).toEqual([]);
    expect(present().tracks.map((t) => t.id)).not.toContain(id);
  });

  it('removeLayer asks before removing a track with clips, and removes it with its clips in one step', async () => {
    addLayer('video');
    const id = present().tracks[1].id;
    s().apply((p) => addClip(addClip(p, id, clip('c1')), id, clip('c2', 3)));
    const withClips = present();
    confirm.answer = false;
    await removeLayer(id);
    expect(confirm.asked).toEqual(['Remove Video 2 and its 2 clips?']);
    expect(present()).toBe(withClips);
    confirm.answer = true;
    await removeLayer(id);
    expect(present().tracks).toHaveLength(2);
    s().undo();
    expect(present()).toBe(withClips);
  });

  it('removeLayer refuses the last track of a kind and a locked track with a toast, without asking', async () => {
    await removeLayer(present().tracks[0].id);
    expect(toasts().at(-1)).toMatch(/at least one video/);
    addLayer('video');
    const id = present().tracks[1].id;
    s().apply((p) => addClip(p, id, clip('c1')));
    toggleTrackFlag(id, 'locked');
    const before = present();
    await removeLayer(id);
    expect(confirm.asked).toEqual([]);
    expect(toasts().at(-1)).toBe('Track is locked');
    expect(present()).toBe(before);
  });
});
