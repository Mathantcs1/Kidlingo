import { describe, it, expect } from 'vitest';
import {
  DEFAULT_PPS,
  FORMAT_LABELS,
  aspectLabel,
  contentSeconds,
  fitBox,
  formatKeyOf,
  formatTime,
  formatTimecode,
  followScroll,
  pxToTime,
  rulerTicks,
  timeToPx,
  zoom,
} from '../src/ui/layout';
import {
  SPLIT_HINT,
  addMedia,
  appendMedia,
  deleteClips,
  liveSelection,
  mergeClips,
  splitAt,
  splitTargets,
  toggleSelection,
} from '../src/ui/edits';
import { isTextEntry, shortcutBlockedByRange, shortcutFor } from '../src/ui/keys';
import { emptyProject } from '../src/core/model';
import type { MediaRef, Project } from '../src/core/model';
import { TimelineError } from '../src/core/timeline';

const video: MediaRef = { id: 'v', name: 'v.mp4', kind: 'video', duration: 3, width: 640, height: 360, hasAudio: true };
const video2: MediaRef = { id: 'w', name: 'w.mp4', kind: 'video', duration: 2, width: 640, height: 360, hasAudio: false };
const audio: MediaRef = { id: 'a', name: 'a.wav', kind: 'audio', duration: 2, hasAudio: true };
const image: MediaRef = { id: 'i', name: 'i.png', kind: 'image', duration: 5, width: 100, height: 100, hasAudio: false };

function withMedia(...ms: MediaRef[]): Project {
  return ms.reduce(addMedia, emptyProject('youtube'));
}

const clipsOf = (p: Project, kind: 'video' | 'audio') => p.tracks.find((t) => t.kind === kind)!.clips;

describe('followScroll', () => {
  it('leaves the scroll alone while the playhead is visible', () => {
    expect(followScroll(100, 0, 800)).toBeNull();
    expect(followScroll(799, 0, 800)).toBeNull();
    expect(followScroll(1000, 900, 800)).toBeNull();
  });

  it('pages forward so the playhead sits near the left edge once it leaves the view', () => {
    expect(followScroll(800, 0, 800)).toBe(800 - 80);
    expect(followScroll(2000, 0, 800)).toBe(2000 - 80);
  });

  it('jumps back when the playhead is left of the view, never below 0', () => {
    expect(followScroll(100, 900, 800)).toBe(20);
    expect(followScroll(10, 900, 800)).toBe(0);
  });

  it('does nothing without a measured viewport', () => {
    expect(followScroll(100, 0, 0)).toBeNull();
  });
});

describe('formatTimecode', () => {
  it('shows minutes, seconds and tenths without rounding up', () => {
    expect(formatTimecode(0)).toBe('0:00.0');
    expect(formatTimecode(1.5)).toBe('0:01.5');
    expect(formatTimecode(1.99)).toBe('0:01.9');
    expect(formatTimecode(0.3)).toBe('0:00.3');
    expect(formatTimecode(65.25)).toBe('1:05.2');
    expect(formatTimecode(3600)).toBe('60:00.0');
    expect(formatTimecode(Number.NaN)).toBe('0:00.0');
    expect(formatTimecode(-4)).toBe('0:00.0');
  });
});

describe('layout', () => {
  it('converts between time and pixels', () => {
    expect(DEFAULT_PPS).toBe(60);
    expect(timeToPx(1.5, 60)).toBe(90);
    expect(pxToTime(90, 60)).toBe(1.5);
    expect(pxToTime(-10, 60)).toBe(0);
  });

  it('formats seconds as mm:ss', () => {
    expect(formatTime(0)).toBe('00:00');
    expect(formatTime(2.98)).toBe('00:03');
    expect(formatTime(65)).toBe('01:05');
    expect(formatTime(3600)).toBe('60:00');
    expect(formatTime(Number.NaN)).toBe('00:00');
    expect(formatTime(-4)).toBe('00:00');
  });

  it('generates ruler ticks spaced for readability', () => {
    const t60 = rulerTicks(5, 60);
    expect(t60.map((t) => t.time)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(t60[1].label).toBe('00:01');
    const t10 = rulerTicks(20, 10);
    expect(t10.map((t) => t.time)).toEqual([0, 5, 10, 15, 20]);
    expect(rulerTicks(0, 60)).toEqual([{ time: 0, label: '00:00' }]);
  });

  it('zooms within bounds', () => {
    expect(zoom(60, 'in')).toBe(90);
    expect(zoom(60, 'out')).toBe(40);
    expect(zoom(400, 'in')).toBe(480);
    expect(zoom(12, 'out')).toBe(10);
  });

  it('fits a box of an aspect inside a container', () => {
    expect(fitBox({ width: 800, height: 400 }, { width: 1920, height: 1080 })).toEqual({ width: 711, height: 400 });
    expect(fitBox({ width: 400, height: 800 }, { width: 1920, height: 1080 })).toEqual({ width: 400, height: 225 });
    expect(fitBox({ width: 0, height: 0 }, { width: 1080, height: 1920 })).toEqual({ width: 0, height: 0 });
  });

  it('maps a project format back to its key', () => {
    expect(formatKeyOf({ width: 1080, height: 1920 })).toBe('vertical');
    expect(formatKeyOf({ width: 1080, height: 1350 })).toBe('portrait');
    expect(formatKeyOf({ width: 100, height: 100 })).toBeNull();
  });

  it('labels formats and aspect ratios', () => {
    expect(FORMAT_LABELS.vertical).toBe('Vertical 9:16 (Reels/Shorts/TikTok)');
    expect(aspectLabel(1920, 1080)).toBe('16:9');
    expect(aspectLabel(1080, 1350)).toBe('4:5');
    expect(aspectLabel(1080, 1080)).toBe('1:1');
  });

  it('keeps room after the last clip', () => {
    expect(contentSeconds(0)).toBe(60);
    expect(contentSeconds(100.2)).toBe(131);
  });
});

describe('edits', () => {
  it('registers media without touching tracks', () => {
    const p = withMedia(video);
    expect(p.media.v).toEqual(video);
    expect(p.tracks.every((t) => t.clips.length === 0)).toBe(true);
  });

  it('appends media at the end of the first track of the right kind', () => {
    let p = withMedia(video, video2, audio, image);
    p = appendMedia(p, 'v');
    p = appendMedia(p, 'w');
    p = appendMedia(p, 'a');
    p = appendMedia(p, 'i');
    expect(clipsOf(p, 'video').map((c) => [c.mediaId, c.start, c.out])).toEqual([
      ['v', 0, 3],
      ['w', 3, 2],
      ['i', 5, 5],
    ]);
    expect(clipsOf(p, 'audio').map((c) => [c.mediaId, c.start])).toEqual([['a', 0]]);
    expect(() => appendMedia(p, 'nope')).toThrow(TimelineError);
  });

  it('finds split targets: selected clips under the playhead, else every clip under it', () => {
    let p = appendMedia(appendMedia(appendMedia(withMedia(video, video2, audio), 'v'), 'w'), 'a');
    const [v, w] = clipsOf(p, 'video');
    const [a] = clipsOf(p, 'audio');
    expect(splitTargets(p, [], 1).sort()).toEqual([v.id, a.id].sort());
    expect(splitTargets(p, [v.id], 1)).toEqual([v.id]);
    expect(splitTargets(p, [w.id], 1)).toEqual([]);
    expect(splitTargets(p, [], 3)).toEqual([]);
    expect(splitTargets(p, [], 4)).toEqual([w.id]);
    expect(splitTargets(p, [], 0)).toEqual([]);
    expect(splitTargets(p, [], 10)).toEqual([]);
    p = splitAt(p, [v.id], 1);
    expect(clipsOf(p, 'video').map((c) => c.start)).toEqual([0, 1, 3]);
    expect(() => splitAt(p, [], 10)).toThrow(SPLIT_HINT);
  });

  it('deletes several clips at once without rippling', () => {
    const p = appendMedia(appendMedia(withMedia(video, video2), 'v'), 'w');
    const [v, w] = clipsOf(p, 'video');
    expect(clipsOf(deleteClips(p, [v.id]), 'video').map((c) => c.start)).toEqual([3]);
    expect(clipsOf(deleteClips(p, [v.id, w.id]), 'video')).toEqual([]);
    expect(deleteClips(p, [])).toBe(p);
  });

  it('merges the selection ordered by start', () => {
    let p = appendMedia(appendMedia(withMedia(video, video2), 'v'), 'w');
    const [v] = clipsOf(p, 'video');
    p = splitAt(splitAt(p, [], 1), [], 2);
    const [a, b, c] = clipsOf(p, 'video');
    expect(a.id).toBe(v.id);
    p = deleteClips(p, [b.id]);
    p = mergeClips(p, [c.id, a.id]);
    expect(clipsOf(p, 'video').map((x) => x.start)).toEqual([0, 1, 2]);
    expect(() => mergeClips(p, [a.id])).toThrow(TimelineError);
  });

  it('toggles or replaces the selection', () => {
    expect(toggleSelection(['a', 'b'], 'c', false)).toEqual(['c']);
    expect(toggleSelection(['a', 'b'], 'c', true)).toEqual(['a', 'b', 'c']);
    expect(toggleSelection(['a', 'b'], 'a', true)).toEqual(['b']);
  });
});

describe('liveSelection', () => {
  it('drops ids of clips that no longer exist, keeping the array when nothing is stale', () => {
    const p = appendMedia(withMedia(video), 'v');
    const [v] = clipsOf(p, 'video');
    expect(liveSelection(p, [v.id, 'ghost'])).toEqual([v.id]);
    const sel = [v.id];
    expect(liveSelection(p, sel)).toBe(sel);
    expect(liveSelection(p, ['ghost'])).toEqual([]);
  });
});

describe('keys', () => {
  it('treats only text-entry fields as typing targets', () => {
    expect(isTextEntry({ tagName: 'INPUT', type: 'text' })).toBe(true);
    for (const type of ['', 'search', 'number', 'email', 'url', 'password', 'tel']) {
      expect(isTextEntry({ tagName: 'INPUT', type })).toBe(true);
    }
    expect(isTextEntry({ tagName: 'INPUT' })).toBe(true);
    for (const type of ['file', 'checkbox', 'radio', 'range', 'button', 'color']) {
      expect(isTextEntry({ tagName: 'INPUT', type })).toBe(false);
    }
    expect(isTextEntry({ tagName: 'SELECT' })).toBe(true);
    expect(isTextEntry({ tagName: 'TEXTAREA' })).toBe(true);
    expect(isTextEntry({ tagName: 'DIV', isContentEditable: true })).toBe(true);
    expect(isTextEntry({ tagName: 'BUTTON' })).toBe(false);
    expect(isTextEntry({ tagName: 'BODY' })).toBe(false);
  });

  const key = (k: Partial<{ key: string; code: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean; repeat: boolean }>) => ({
    key: '', code: '', ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, repeat: false, ...k,
  });

  it('maps keys to shortcuts', () => {
    expect(shortcutFor(key({ key: ' ', code: 'Space' }))).toBe('play');
    expect(shortcutFor(key({ key: 's', code: 'KeyS' }))).toBe('split');
    expect(shortcutFor(key({ key: 'S', code: 'KeyS', shiftKey: true }))).toBeNull();
    expect(shortcutFor(key({ key: 'Delete' }))).toBe('delete');
    expect(shortcutFor(key({ key: 'Backspace' }))).toBe('delete');
    expect(shortcutFor(key({ key: 'Delete', shiftKey: true }))).toBe('rippleDelete');
    expect(shortcutFor(key({ key: 'Backspace', shiftKey: true }))).toBe('rippleDelete');
    expect(shortcutFor(key({ key: 'z', ctrlKey: true }))).toBe('undo');
    expect(shortcutFor(key({ key: 'z', metaKey: true }))).toBe('undo');
    expect(shortcutFor(key({ key: 'Z', metaKey: true, shiftKey: true }))).toBe('redo');
    expect(shortcutFor(key({ key: 'y', ctrlKey: true }))).toBe('redo');
    expect(shortcutFor(key({ key: 's', ctrlKey: true }))).toBeNull();
    expect(shortcutFor(key({ key: 'x' }))).toBeNull();
  });

  it('ignores auto-repeat for play, split and delete but not for undo/redo', () => {
    expect(shortcutFor(key({ key: ' ', code: 'Space', repeat: true }))).toBeNull();
    expect(shortcutFor(key({ key: 's', repeat: true }))).toBeNull();
    expect(shortcutFor(key({ key: 'Delete', repeat: true }))).toBeNull();
    expect(shortcutFor(key({ key: 'Backspace', repeat: true }))).toBeNull();
    expect(shortcutFor(key({ key: 'z', ctrlKey: true, repeat: true }))).toBe('undo');
  });
});

describe('NumberField helpers', () => {
  it('formatNumber shows at most 2 decimals and never -0', async () => {
    const { formatNumber } = await import('../src/ui/NumberField');
    expect(formatNumber(168.75)).toBe('168.75');
    expect(formatNumber(30.000000000000004)).toBe('30');
    expect(formatNumber(1 / 3)).toBe('0.33');
    expect(formatNumber(-0.001)).toBe('0');
    expect(formatNumber(-12.5)).toBe('-12.5');
  });

  it('parseEntry accepts finite numbers only', async () => {
    const { parseEntry } = await import('../src/ui/NumberField');
    expect(parseEntry(' 42 ')).toBe(42);
    expect(parseEntry('-1.5')).toBe(-1.5);
    for (const bad of ['', '   ', 'abc', '12px', '1e999', 'Infinity', 'NaN']) expect(parseEntry(bad)).toBeNull();
  });
});

describe('parseEntry locale forms', () => {
  it('accepts a Unicode minus and a comma decimal separator; rejects comma plus dot', async () => {
    const { parseEntry } = await import('../src/ui/NumberField');
    expect(parseEntry('\u221212')).toBe(-12);
    expect(parseEntry('12,5')).toBe(12.5);
    expect(parseEntry('\u22120,25')).toBe(-0.25);
    expect(parseEntry('1,234.5')).toBeNull();
    expect(parseEntry('1,2,3')).toBeNull();
  });
});

describe('shortcutBlockedByRange', () => {
  it('range sliders own Delete/Backspace and S, but not undo, redo or play', () => {
    const range = { tagName: 'INPUT', type: 'range' };
    for (const s of ['delete', 'rippleDelete', 'split'] as const) expect(shortcutBlockedByRange(range, s), s).toBe(true);
    for (const s of ['undo', 'redo', 'play'] as const) expect(shortcutBlockedByRange(range, s), s).toBe(false);
    expect(shortcutBlockedByRange({ tagName: 'INPUT', type: 'color' }, 'delete')).toBe(true);
    expect(shortcutBlockedByRange({ tagName: 'DIV' }, 'delete')).toBe(false);
    expect(shortcutBlockedByRange({ tagName: 'INPUT', type: 'checkbox' }, 'delete')).toBe(false);
  });
});
