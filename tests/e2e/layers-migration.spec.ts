// Review focus #1: a project saved by an older version (v1, tracks without names or flags) opens unchanged, with
// no restore notice, and is saved back at the current version (v6) once edited; v2 and v3 saves gain audio and
// picture-effect defaults; a project from a newer version (CURRENT_VERSION + 1) stays unsupported and is never overwritten. (The v5 -> v6
// picture test lives in keyframes-migration.spec.ts.)
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipStates, importFiles, open, trackErrors, withAudio } from './helpers';
import { CURRENT_VERSION } from '../helpers/project';

test.setTimeout(60_000);

interface Saved {
  version: number;
  format: { width: number; height: number; fps: number };
  tracks: { id: string; kind: string; clips: unknown[]; [k: string]: unknown }[];
  media: Record<string, unknown>;
}

const DEFAULT_AUDIO = { fadeIn: 0, fadeOut: 0, pan: 0, silent: false, effects: [] };
const DEFAULT_PICTURE = { effects: [], blend: 'normal' };

const storedIds = (page: Page): Promise<string[]> => page.evaluate(() => window.__clipforge!.listMediaIds());

/** The raw saved project, read straight from idb-keyval's store. */
function savedProject(page: Page): Promise<Saved | undefined> {
  return page.evaluate(
    () =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const get = req.result.transaction('keyval').objectStore('keyval').get('clipforge:current');
          get.onsuccess = () => resolve(get.result);
          get.onerror = () => reject(get.error);
        };
        req.onerror = () => reject(req.error);
      }),
  );
}

/** Overwrites the saved project in idb-keyval's store. */
function writeSaved(page: Page, value: unknown): Promise<void> {
  return page.evaluate(
    (v) =>
      new Promise<void>((resolve, reject) => {
        const req = indexedDB.open('keyval-store');
        req.onsuccess = () => {
          const tx = req.result.transaction('keyval', 'readwrite');
          tx.objectStore('keyval').put(v, 'clipforge:current');
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      }),
    value,
  );
}

/** A real imported file (stored media) on the timeline, autosaved; returns the saved current-version project. */
async function savedWithClip(page: Page): Promise<Saved> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const saved = await savedProject(page);
  expect(saved?.version).toBe(CURRENT_VERSION);
  return saved!;
}

test('a v1 save opens unchanged (no notice), gains default track flags and is saved back at the current version', async ({ page }) => {
  const errors = trackErrors(page);
  const v2 = await savedWithClip(page);
  const ids = await storedIds(page);
  // The v1 shape: version 1, tracks carry only id, kind and clips.
  const v1 = {
    version: 1,
    format: v2.format,
    tracks: v2.tracks.map((t) => ({ id: t.id, kind: t.kind, clips: t.clips })),
    media: v2.media,
  };
  expect(v1.tracks.map((t) => t.kind)).toEqual(['video', 'audio']);
  expect(v1.tracks[0].clips).toHaveLength(1);
  await writeSaved(page, v1);
  const before = await clipStates(page);

  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  await expect(page.getByTestId('timeline-clip')).not.toHaveAttribute('data-missing', 'true');
  expect(await clipStates(page)).toEqual(before);
  const p = await page.evaluate(() => window.__clipforge!.getState().history.present);
  expect(p.version).toBe(CURRENT_VERSION);
  expect(p.format).toEqual(v2.format);
  expect(p.media).toEqual(v2.media);
  expect(p.tracks.map((t) => ({ ...t, clips: t.clips.length }))).toEqual(
    v1.tracks.map((t) => ({
      id: t.id, kind: t.kind, name: '', hidden: false, muted: false, solo: false, locked: false, volume: 1, duck: null, clips: t.clips.length,
    })),
  );
  expect(p.tracks[0].clips).toEqual((v1.tracks[0].clips as object[]).map((c) => ({ ...c, audio: DEFAULT_AUDIO, ...DEFAULT_PICTURE })));
  await expect(page.getByTestId('track-header')).toHaveCount(2);

  // Editing works: add a layer; the next save is v3 with the new layer and the same media files.
  await page.getByTestId('btn-add-video-layer').click();
  await expect(page.getByTestId('track-header')).toHaveCount(3);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const after = await savedProject(page);
  expect(after?.version).toBe(CURRENT_VERSION);
  expect(after?.tracks).toHaveLength(3);
  expect(after?.tracks.every((t) => t.hidden === false && t.locked === false && typeof t.name === 'string')).toBe(true);
  expect(await storedIds(page)).toEqual(ids);
  expect(errors).toEqual([]);
});

test('a v2 save opens with every clip, gains default audio settings and is saved back at the current version', async ({ page }) => {
  const errors = trackErrors(page);
  const cur = await savedWithClip(page);
  const ids = await storedIds(page);
  // The v2 shape: no clip audio, no track volume or duck.
  const v2 = {
    ...cur,
    version: 2,
    tracks: cur.tracks.map(({ volume: _v, duck: _d, ...t }) => ({
      ...t,
      clips: (t.clips as Record<string, unknown>[]).map(({ audio: _a, ...c }) => c),
    })),
  };
  await writeSaved(page, v2);
  const before = await clipStates(page);

  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  expect(await clipStates(page)).toEqual(before);
  const p = await page.evaluate(() => window.__clipforge!.getState().history.present);
  expect(p.version).toBe(CURRENT_VERSION);
  for (const t of p.tracks) {
    expect(t).toMatchObject({ volume: 1, duck: null });
    for (const c of t.clips) expect(c).toMatchObject({ audio: DEFAULT_AUDIO, ...DEFAULT_PICTURE });
  }

  await page.getByTestId('btn-add-video-layer').click();
  await expect(page.getByTestId('track-header')).toHaveCount(3);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const after = await savedProject(page);
  expect(after?.version).toBe(CURRENT_VERSION);
  expect(after?.tracks.every((t) => t.volume === 1 && t.duck === null)).toBe(true);
  expect(after?.tracks[0].clips).toEqual(p.tracks[0].clips);
  expect(await storedIds(page)).toEqual(ids);
  expect(errors).toEqual([]);
});

test('a v3 save opens with every clip, gains empty effect stacks and normal blend, and is saved back at the current version', async ({ page }) => {
  const errors = trackErrors(page);
  const cur = await savedWithClip(page);
  const ids = await storedIds(page);
  // The v3 shape: clips carry audio but no effects or blend.
  const v3 = {
    ...cur,
    version: 3,
    tracks: cur.tracks.map((t) => ({
      ...t,
      clips: (t.clips as Record<string, unknown>[]).map(({ effects: _e, blend: _b, ...c }) => c),
    })),
  };
  await writeSaved(page, v3);
  const before = await clipStates(page);

  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await expect(page.getByTestId('restore-failed')).toHaveCount(0);
  expect(await clipStates(page)).toEqual(before);
  const p = await page.evaluate(() => window.__clipforge!.getState().history.present);
  expect(p.version).toBe(CURRENT_VERSION);
  expect(p.tracks.flatMap((t) => t.clips)).toHaveLength(1);
  for (const c of p.tracks.flatMap((t) => t.clips)) expect(c).toMatchObject(DEFAULT_PICTURE);

  await page.getByTestId('btn-add-video-layer').click();
  await expect(page.getByTestId('track-header')).toHaveCount(3);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const after = await savedProject(page);
  expect(after?.version).toBe(CURRENT_VERSION);
  expect(after?.tracks[0].clips).toEqual(p.tracks[0].clips);
  expect(await storedIds(page)).toEqual(ids);
  expect(errors).toEqual([]);
});

test('a save from the next version is unsupported: notice shown, the stored project and its media are left alone', async ({ page }) => {
  const v2 = await savedWithClip(page);
  const ids = await storedIds(page);
  const v7 = { ...v2, version: CURRENT_VERSION + 1 };
  await writeSaved(page, v7);

  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toContainText('newer version');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  // Editing (a new layer) neither autosaves over it nor lets the startup GC free its media.
  await page.getByTestId('btn-add-video-layer').click();
  await expect(page.getByTestId('track-header')).toHaveCount(3);
  await page.waitForTimeout(1500);
  expect(await savedProject(page)).toEqual(v7);
  expect(await storedIds(page)).toEqual(ids);
});
