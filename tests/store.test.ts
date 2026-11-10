import { describe, it, expect, beforeEach } from 'vitest';
import { emptyProject, defaultTransform } from '../src/core/model';
import type { Clip } from '../src/core/model';
import { addClip, deleteClip } from '../src/core/timeline';
import { useEditor, flushAutosave } from '../src/state/store';
import { reconcileMedia } from '../src/state/persist';
import type { Project } from '../src/core/model';

const clip = (id: string, over: Partial<Clip> = {}): Clip => ({
  id,
  mediaId: 'm1',
  kind: 'video',
  start: 0,
  in: 0,
  out: 5,
  transform: defaultTransform(),
  volume: 1,
  fit: 'fit',
  ...over,
});

beforeEach(() => {
  useEditor.getState().loadProject(emptyProject());
});

describe('store', () => {
  it('apply then undo restores previous project; redo reapplies', () => {
    const s = useEditor.getState();
    const before = s.history.present;
    s.apply((p) => addClip(p, p.tracks[0].id, clip('c1')));
    expect(useEditor.getState().history.present.tracks[0].clips).toHaveLength(1);
    useEditor.getState().undo();
    expect(useEditor.getState().history.present).toBe(before);
    useEditor.getState().redo();
    expect(useEditor.getState().history.present.tracks[0].clips).toHaveLength(1);
  });

  it('TimelineError leaves present unchanged and sets lastError; next success clears it', () => {
    const s = useEditor.getState();
    const before = s.history.present;
    s.apply((p) => addClip(p, 'nope', clip('c1')));
    expect(useEditor.getState().history.present).toBe(before);
    expect(useEditor.getState().lastError).toEqual(expect.any(String));
    useEditor.getState().apply((p) => addClip(p, p.tracks[0].id, clip('c1')));
    expect(useEditor.getState().lastError).toBeNull();
  });

  it('non-TimelineError propagates', () => {
    expect(() =>
      useEditor.getState().apply(() => {
        throw new TypeError('bug');
      }),
    ).toThrow(TypeError);
  });

  it('undo/redo/loadProject clear lastError', () => {
    const s = useEditor.getState();
    s.apply((p) => addClip(p, 'nope', clip('c1')));
    expect(useEditor.getState().lastError).not.toBeNull();
    useEditor.getState().undo();
    expect(useEditor.getState().lastError).toBeNull();
    useEditor.getState().apply((p) => addClip(p, 'nope', clip('c1')));
    useEditor.getState().redo();
    expect(useEditor.getState().lastError).toBeNull();
    useEditor.getState().apply((p) => addClip(p, 'nope', clip('c1')));
    useEditor.getState().loadProject(emptyProject());
    expect(useEditor.getState().lastError).toBeNull();
  });

  it('apply prunes selection ids that no longer exist', () => {
    useEditor.getState().apply((p) => addClip(p, p.tracks[0].id, clip('c1')));
    useEditor.getState().select(['c1', 'ghost']);
    expect(useEditor.getState().selection).toEqual(['c1', 'ghost']);
    useEditor.getState().apply((p) => p);
    useEditor.getState().apply((p) => addClip(p, p.tracks[0].id, clip('c2', { start: 5 })));
    expect(useEditor.getState().selection).toEqual(['c1']);
    useEditor.getState().apply((p) => deleteClip(p, 'c1'));
    expect(useEditor.getState().selection).toEqual([]);
  });

  it('undo and redo prune selection ids that no longer exist', () => {
    const s = useEditor.getState();
    s.apply((p) => addClip(p, p.tracks[0].id, clip('c1')));
    s.apply((p) => addClip(p, p.tracks[0].id, clip('c2', { start: 5 })));
    s.select(['c1', 'c2']);
    useEditor.getState().undo();
    expect(useEditor.getState().selection).toEqual(['c1']);
    useEditor.getState().undo();
    expect(useEditor.getState().selection).toEqual([]);
    useEditor.getState().redo();
    useEditor.getState().select(['c1', 'ghost']);
    useEditor.getState().redo();
    expect(useEditor.getState().selection).toEqual(['c1']);
    // Nothing to prune: the selection array is kept as is.
    const kept = useEditor.getState().selection;
    useEditor.getState().undo();
    expect(useEditor.getState().selection).toBe(kept);
  });

  it('loadProject resets history, selection, playhead, playing', () => {
    const s = useEditor.getState();
    s.apply((p) => addClip(p, p.tracks[0].id, clip('c1')));
    s.select(['c1']);
    s.setPlayhead(3);
    s.setPlaying(true);
    const fresh = emptyProject();
    useEditor.getState().loadProject(fresh);
    const n = useEditor.getState();
    expect(n.history).toEqual({ past: [], present: fresh, future: [] });
    expect(n.selection).toEqual([]);
    expect(n.playhead).toBe(0);
    expect(n.playing).toBe(false);
  });

  it('flushAutosave resolves without indexedDB', async () => {
    await expect(flushAutosave()).resolves.toBeUndefined();
  });
});

describe('reconcileMedia', () => {
  const base = (): Project => ({
    ...emptyProject(),
    media: {
      m1: { id: 'm1', name: 'a', kind: 'video', duration: 1, hasAudio: true },
      m2: { id: 'm2', name: 'b', kind: 'video', duration: 1, hasAudio: true },
      m3: { id: 'm3', name: 'c', kind: 'video', duration: 1, hasAudio: true, missing: true },
    },
  });

  it('flags absent media, leaves present untouched, clears stale missing, no mutation', async () => {
    const p = base();
    const snapshot = JSON.parse(JSON.stringify(p));
    const q = await reconcileMedia(p, async (id) => id !== 'm1');
    expect(q.media.m1.missing).toBe(true);
    expect(q.media.m2).toBe(p.media.m2);
    expect(q.media.m2.missing).toBeUndefined();
    expect(q.media.m3.missing).toBeFalsy();
    expect(p).toEqual(snapshot);
  });

  it('clamps the playhead when the timeline shrinks (delete, undo, redo, load)', () => {
    const s = useEditor.getState();
    s.apply((p) => addClip(p, p.tracks[0].id, clip('c1')));
    s.apply((p) => addClip(p, p.tracks[0].id, clip('c2', { start: 5 })));
    useEditor.getState().setPlayhead(8);
    useEditor.getState().apply((p) => deleteClip(p, 'c2'));
    expect(useEditor.getState().playhead).toBe(5);
    useEditor.getState().undo();
    expect(useEditor.getState().playhead).toBe(5);
    useEditor.getState().setPlayhead(9);
    useEditor.getState().undo();
    expect(useEditor.getState().playhead).toBe(5);
    useEditor.getState().undo();
    expect(useEditor.getState().playhead).toBe(0);
    useEditor.getState().redo();
    expect(useEditor.getState().playhead).toBe(0);
  });

  it('keeps the playhead when the timeline does not shrink below it', () => {
    useEditor.getState().apply((p) => addClip(p, p.tracks[0].id, clip('c1')));
    useEditor.getState().setPlayhead(3);
    useEditor.getState().apply((p) => addClip(p, p.tracks[0].id, clip('c2', { start: 5 })));
    expect(useEditor.getState().playhead).toBe(3);
  });
});
