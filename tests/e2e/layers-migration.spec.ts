// Review focus #1: a project saved by the previous version (v1, tracks without names or flags) opens unchanged, with
// no restore notice, and is saved back as v2 once edited; a project from a newer version (v3) stays unsupported.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, clipStates, importFiles, open, trackErrors, withAudio } from './helpers';

test.setTimeout(60_000);

interface Saved {
  version: number;
  format: { width: number; height: number; fps: number };
  tracks: { id: string; kind: string; clips: unknown[]; [k: string]: unknown }[];
  media: Record<string, unknown>;
}

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

/** A real imported file (stored media) on the timeline, autosaved; returns the saved v2 project. */
async function savedWithClip(page: Page): Promise<Saved> {
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const saved = await savedProject(page);
  expect(saved?.version).toBe(2);
  return saved!;
}

test('a v1 save opens unchanged (no notice), gains default track flags and is saved back as v2', async ({ page }) => {
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
  expect(p.version).toBe(2);
  expect(p.format).toEqual(v2.format);
  expect(p.media).toEqual(v2.media);
  expect(p.tracks.map((t) => ({ ...t, clips: t.clips.length }))).toEqual(
    v1.tracks.map((t) => ({ id: t.id, kind: t.kind, name: '', hidden: false, muted: false, solo: false, locked: false, clips: t.clips.length })),
  );
  expect(p.tracks[0].clips).toEqual(v1.tracks[0].clips);
  await expect(page.getByTestId('track-header')).toHaveCount(2);

  // Editing works: add a layer; the next save is v2 with the new layer and the same media files.
  await page.getByTestId('btn-add-video-layer').click();
  await expect(page.getByTestId('track-header')).toHaveCount(3);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  const after = await savedProject(page);
  expect(after?.version).toBe(2);
  expect(after?.tracks).toHaveLength(3);
  expect(after?.tracks.every((t) => t.hidden === false && t.locked === false && typeof t.name === 'string')).toBe(true);
  expect(await storedIds(page)).toEqual(ids);
  expect(errors).toEqual([]);
});

test('a v3 save is still unsupported: notice shown, the stored project and its media are left alone', async ({ page }) => {
  const v2 = await savedWithClip(page);
  const ids = await storedIds(page);
  const v3 = { ...v2, version: 3 };
  await writeSaved(page, v3);

  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('restore-failed')).toContainText('newer version');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  // Editing (a new layer) neither autosaves over it nor lets the startup GC free its media.
  await page.getByTestId('btn-add-video-layer').click();
  await expect(page.getByTestId('track-header')).toHaveCount(3);
  await page.waitForTimeout(1500);
  expect(await savedProject(page)).toEqual(v3);
  expect(await storedIds(page)).toEqual(ids);
});
