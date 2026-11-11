import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const save = vi.hoisted(() => vi.fn<(p: unknown) => Promise<void>>());
vi.mock('../src/state/persist', () => ({ saveProject: save }));

import { defaultClipAudio, emptyProject, defaultTransform } from '../src/core/model';
import type { Clip } from '../src/core/model';
import { addClip } from '../src/core/timeline';
import { useEditor, flushAutosave, flushOnHide, setAutosaveEnabled } from '../src/state/store';

const clip = (id: string, start = 0): Clip => ({
  id,
  mediaId: 'm1',
  kind: 'video',
  start,
  in: 0,
  out: 5,
  transform: defaultTransform(),
  volume: 1,
  audio: defaultClipAudio(), effects: [], blend: 'normal',
  fit: 'fit',
});
const add = (id: string, start = 0) =>
  useEditor.getState().apply((p) => addClip(p, p.tracks[0].id, clip(id, start)));

let errSpy: ReturnType<typeof vi.spyOn>;

beforeEach(async () => {
  vi.useFakeTimers();
  vi.stubGlobal('indexedDB', {});
  save.mockReset();
  save.mockResolvedValue(undefined);
  errSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  setAutosaveEnabled(true);
  useEditor.getState().loadProject(emptyProject());
  await flushAutosave().catch(() => undefined); // drain anything pending from the previous test
  useEditor.setState({ saveError: null });
  save.mockClear();
  errSpy.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  errSpy.mockRestore();
});

describe('autosave', () => {
  it('collapses edits within 500 ms into one save of the latest project', async () => {
    add('c1');
    await vi.advanceTimersByTimeAsync(300);
    add('c2', 5);
    await vi.advanceTimersByTimeAsync(300);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(200);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(useEditor.getState().history.present);
  });

  it('selection and playhead changes cause no save', async () => {
    useEditor.getState().select(['x']);
    useEditor.getState().setPlayhead(2);
    useEditor.getState().setPlaying(true);
    await vi.advanceTimersByTimeAsync(1000);
    expect(save).not.toHaveBeenCalled();
  });

  it('a rejected timer save is reported, not unhandled, and retried on next flush', async () => {
    save.mockRejectedValueOnce(new Error('quota'));
    add('c1');
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(useEditor.getState().saveError).toBe('quota');
    await flushAutosave();
    expect(save).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenLastCalledWith(useEditor.getState().history.present);
  });

  it('flushAutosave rejects when the save fails', async () => {
    save.mockRejectedValueOnce(new Error('closed'));
    add('c1');
    await expect(flushAutosave()).rejects.toThrow('closed');
  });

  it('flushAutosave saves immediately and awaits an in-flight save', async () => {
    let release!: () => void;
    save.mockImplementationOnce(() => new Promise<void>((r) => (release = r)));
    add('c1');
    await vi.advanceTimersByTimeAsync(500); // timer save now in flight
    let done = false;
    const f = flushAutosave().then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    release();
    await f;
    expect(done).toBe(true);

    add('c2', 5);
    await flushAutosave(); // no timer wait
    expect(save).toHaveBeenCalledTimes(2);
  });

  it('loadProject after an edit saves the loaded project, not the stale one', async () => {
    add('c1');
    const loaded = emptyProject();
    useEditor.getState().loadProject(loaded);
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(loaded);
  });

  it('does nothing without indexedDB', async () => {
    vi.unstubAllGlobals();
    add('c1');
    await vi.advanceTimersByTimeAsync(1000);
    await flushAutosave();
    expect(save).not.toHaveBeenCalled();
  });

  it('exposes the first failure as saveError and clears it when a later save succeeds', async () => {
    save.mockRejectedValueOnce(new DOMException('full', 'QuotaExceededError'));
    add('c1');
    await vi.advanceTimersByTimeAsync(500);
    expect(useEditor.getState().saveError).toBe(
      "Your browser's storage is full. Remove media you no longer need, then reload the page (or start a New project) to free the space.",
    );
    save.mockRejectedValueOnce(new Error('still broken'));
    add('c2', 5);
    await vi.advanceTimersByTimeAsync(500);
    expect(useEditor.getState().saveError).toBe('still broken');
    add('c3', 10);
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(3);
    expect(useEditor.getState().saveError).toBeNull();
  });

  it('saves nothing while disabled (a tab that does not own the editor)', async () => {
    setAutosaveEnabled(false);
    add('c1');
    await vi.advanceTimersByTimeAsync(1000);
    await flushAutosave();
    expect(save).not.toHaveBeenCalled();
  });

  it('flushes a pending change when the page is hidden or unloaded', async () => {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    const off = flushOnHide(win, doc);
    add('c1');
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).not.toHaveBeenCalled();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    add('c2', 5);
    win.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    off();
    add('c3', 10);
    win.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
  });
});
