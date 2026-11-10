import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';

const dir = ensureFixtures();
const withAudio = join(dir, 'with-audio.mp4');
const noAudio = join(dir, 'no-audio.mp4');
const tone = join(dir, 'tone.wav');
const truncated = join(dir, 'truncated.mp4');
const PPS = 60;

interface ClipBox {
  id: string;
  /** Left edge relative to the ruler origin (time 0), px. */
  left: number;
  width: number;
  top: number;
  selected: boolean;
  missing: boolean;
}

async function open(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  // Editing controls are inert only while the saved session loads.
  await expect(page.getByTestId('file-input')).toBeEnabled();
  await expect(page.getByTestId('format-select')).toBeEnabled();
  await expect(page.getByTestId('btn-split')).toBeEnabled();
}

function mediaItem(page: Page, name: string): Locator {
  return page.getByTestId('media-item').filter({ hasText: name });
}

async function importFiles(page: Page, files: string[], expected: number): Promise<void> {
  await page.getByTestId('file-input').setInputFiles(files);
  await expect(page.getByTestId('media-item')).toHaveCount(expected);
}

async function addToTimeline(page: Page, name: string, expectedClips: number): Promise<void> {
  await mediaItem(page, name).getByTestId('btn-add-to-timeline').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(expectedClips);
}

/** Imports both MP4 fixtures and appends both to the timeline (with-audio first). */
async function setup(page: Page): Promise<void> {
  await open(page);
  await importFiles(page, [withAudio, noAudio], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await addToTimeline(page, 'no-audio.mp4', 2);
}

async function clips(page: Page): Promise<ClipBox[]> {
  const ruler = await page.getByTestId('timeline-ruler').boundingBox();
  if (!ruler) throw new Error('no ruler');
  const out: ClipBox[] = [];
  for (const el of await page.getByTestId('timeline-clip').all()) {
    const box = await el.boundingBox();
    if (!box) throw new Error('clip not visible');
    out.push({
      id: (await el.getAttribute('data-clip-id')) ?? '',
      left: box.x - ruler.x,
      width: box.width,
      top: box.y,
      selected: (await el.getAttribute('data-selected')) === 'true',
      missing: (await el.getAttribute('data-missing')) === 'true',
    });
  }
  return out.sort((a, b) => a.top - b.top || a.left - b.left);
}

function clipEl(page: Page, id: string): Locator {
  return page.locator(`[data-testid="timeline-clip"][data-clip-id="${id}"]`);
}

async function setPlayhead(page: Page, seconds: number): Promise<void> {
  await page.getByTestId('timeline-ruler').click({ position: { x: seconds * PPS, y: 8 } });
}

async function playheadX(page: Page): Promise<number> {
  const ruler = await page.getByTestId('timeline-ruler').boundingBox();
  const ph = await page.getByTestId('playhead').boundingBox();
  if (!ruler || !ph) throw new Error('missing playhead/ruler');
  return ph.x + ph.width / 2 - ruler.x;
}

interface StateSummary {
  playing: boolean;
  format: { width: number; height: number };
  selection: string[];
  undoDepth: number;
}

function editorState(page: Page): Promise<StateSummary> {
  return page.evaluate(() => {
    const s = window.__clipforge!.getState();
    return {
      playing: s.playing,
      format: s.history.present.format,
      selection: s.selection,
      undoDepth: s.history.past.length,
    };
  });
}

async function clearSelection(page: Page): Promise<void> {
  await page.getByTestId('timeline-lane').last().click({ position: { x: 5, y: 5 } });
}

test('imports media into the bin and reports import errors per file', async ({ page }) => {
  await open(page);
  await importFiles(page, [withAudio, noAudio], 2);
  await expect(mediaItem(page, 'with-audio.mp4')).toHaveAttribute('data-has-audio', 'true');
  await expect(mediaItem(page, 'no-audio.mp4')).toHaveAttribute('data-has-audio', 'false');
  await expect(mediaItem(page, 'with-audio.mp4')).toHaveAttribute('data-kind', 'video');
  await expect(mediaItem(page, 'with-audio.mp4')).toContainText('00:03');
  await expect(mediaItem(page, 'no-audio.mp4')).toContainText('00:02');

  await page.getByTestId('file-input').setInputFiles({
    name: 'not-a-video.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('this is just some text, not a video\n'.repeat(20)),
  });
  await expect(page.getByTestId('error-toast')).toContainText(
    'Could not read not-a-video.mp4: the file looks damaged or incomplete.',
  );
  await page.getByTestId('file-input').setInputFiles(truncated);
  const toastWith = (text: string) => page.getByTestId('error-toast').filter({ hasText: text });
  await expect(toastWith('Could not read truncated.mp4: the file looks damaged')).toBeVisible();
  await page.getByTestId('file-input').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hi') });
  await expect(toastWith('Unsupported file type: notes.txt')).toBeVisible();
  await expect(page.getByTestId('media-item')).toHaveCount(2);
});

test('adds media to the end of the right track at 60 px/s', async ({ page }) => {
  await setup(page);
  const [a, b] = await clips(page);
  expect(Math.abs(a.left)).toBeLessThanOrEqual(2);
  expect(Math.abs(a.width - 3 * PPS)).toBeLessThanOrEqual(2);
  expect(Math.abs(b.left - 3 * PPS)).toBeLessThanOrEqual(2);
  expect(Math.abs(b.width - 2 * PPS)).toBeLessThanOrEqual(2);
  expect(Math.abs(a.top - b.top)).toBeLessThanOrEqual(1);
});

test('ruler moves the playhead and split cuts the selected clip', async ({ page }) => {
  await setup(page);
  await setPlayhead(page, 1);
  expect(Math.abs((await playheadX(page)) - PPS)).toBeLessThanOrEqual(2);

  const [first] = await clips(page);
  await clipEl(page, first.id).click();
  await expect(clipEl(page, first.id)).toHaveAttribute('data-selected', 'true');
  await page.getByTestId('btn-split').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  const after = await clips(page);
  expect(Math.abs(after[0].width - PPS)).toBeLessThanOrEqual(2);
  expect(Math.abs(after[1].left - PPS)).toBeLessThanOrEqual(2);
  expect(Math.abs(after[1].width - 2 * PPS)).toBeLessThanOrEqual(2);

  await setPlayhead(page, 10);
  await page.getByTestId('btn-split').click();
  await expect(page.getByTestId('error-toast')).toContainText('Move the playhead inside a clip to split it');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
});

test('merge closes the gap between selected clips; undo and redo step through it', async ({ page }) => {
  await open(page);
  await expect(page.getByTestId('btn-undo')).toBeDisabled();
  await expect(page.getByTestId('btn-redo')).toBeDisabled();
  await importFiles(page, [withAudio, noAudio], 2);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await addToTimeline(page, 'no-audio.mp4', 2);
  await expect(page.getByTestId('btn-undo')).toBeEnabled();

  // Cut with-audio into A [0,1) B [1,2) C [2,3), then delete B to leave a 1 s gap.
  await setPlayhead(page, 1);
  await page.getByTestId('btn-split').click();
  await setPlayhead(page, 2);
  await page.getByTestId('btn-split').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(4);
  const [a, b, c] = await clips(page);
  await clipEl(page, b.id).click();
  await page.getByTestId('btn-delete').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);

  await clipEl(page, a.id).click();
  await clipEl(page, c.id).click({ modifiers: ['Shift'] });
  await expect(clipEl(page, a.id)).toHaveAttribute('data-selected', 'true');
  await expect(clipEl(page, c.id)).toHaveAttribute('data-selected', 'true');
  const before = await clips(page);
  expect(Math.abs(before[1].left - (before[0].left + before[0].width + PPS))).toBeLessThanOrEqual(1);

  await page.getByTestId('btn-merge').click();
  const merged = await clips(page);
  expect(Math.abs(merged[1].left - (merged[0].left + merged[0].width))).toBeLessThanOrEqual(1);
  // The following clip ripples left by the closed gap.
  expect(Math.abs(merged[2].left - 2 * PPS)).toBeLessThanOrEqual(2);
  await expect(page.getByTestId('btn-redo')).toBeDisabled();

  await page.getByTestId('btn-undo').click();
  const undone = await clips(page);
  expect(undone.map((x) => Math.round(x.left))).toEqual(before.map((x) => Math.round(x.left)));
  await expect(page.getByTestId('btn-redo')).toBeEnabled();

  await page.getByTestId('btn-redo').click();
  const redone = await clips(page);
  expect(redone.map((x) => Math.round(x.left))).toEqual(merged.map((x) => Math.round(x.left)));
  await expect(page.getByTestId('btn-redo')).toBeDisabled();
});

test('merging clips on different tracks shows the timeline error and changes nothing', async ({ page }) => {
  await setup(page);
  await importFiles(page, [tone], 3);
  await expect(mediaItem(page, 'tone.wav')).toHaveAttribute('data-kind', 'audio');
  await addToTimeline(page, 'tone.wav', 3);
  const before = await clips(page);
  const audio = before[before.length - 1];
  expect(audio.top).toBeGreaterThan(before[0].top);
  expect(Math.abs(audio.left)).toBeLessThanOrEqual(2);

  await clipEl(page, before[0].id).click();
  await clipEl(page, audio.id).click({ modifiers: ['Shift'] });
  await page.getByTestId('btn-merge').click();
  await expect(page.getByTestId('error-toast')).toContainText('Clips must be on the same track to join');
  const after = await clips(page);
  expect(after.map((x) => [x.id, Math.round(x.left), Math.round(x.width)])).toEqual(
    before.map((x) => [x.id, Math.round(x.left), Math.round(x.width)]),
  );
});

test('delete removes all selected clips in one undo step', async ({ page }) => {
  await setup(page);
  const [a, b] = await clips(page);
  await clipEl(page, a.id).click();
  await page.getByTestId('btn-delete').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(1);
  await page.getByTestId('btn-undo').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);

  await clipEl(page, a.id).click();
  await clipEl(page, b.id).click({ modifiers: ['ControlOrMeta'] });
  await page.getByTestId('btn-delete').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  await page.getByTestId('btn-undo').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
});

test('format picker reframes the project and the preview box', async ({ page }) => {
  await open(page);
  const select = page.getByTestId('format-select');
  await expect(select.locator('option')).toHaveText([
    'YouTube 16:9',
    'Vertical 9:16 (Reels/Shorts/TikTok)',
    'Square 1:1',
    'Portrait 4:5',
  ]);
  await select.selectOption('vertical');
  const canvas = page.getByTestId('preview-canvas');
  await expect(canvas).toHaveAttribute('height', '960');
  const box = await canvas.boundingBox();
  if (!box) throw new Error('no preview canvas');
  expect(Math.abs(box.width / box.height - 9 / 16)).toBeLessThanOrEqual(0.02);
  expect((await editorState(page)).format).toMatchObject({ width: 1080, height: 1920 });
});

test('reload restores clips, format and media bin', async ({ page }) => {
  await setup(page);
  await page.getByTestId('format-select').selectOption('square');
  const before = await clips(page);
  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('media-item')).toHaveCount(2);
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  await expect(page.getByTestId('format-select')).toHaveValue('square');
  const after = await clips(page);
  expect(after.map((x) => [x.id, Math.round(x.left), Math.round(x.width)])).toEqual(
    before.map((x) => [x.id, Math.round(x.left), Math.round(x.width)]),
  );
});

test('media removed from storage is flagged missing after reload without crashing', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await setup(page);
  const id = await mediaItem(page, 'with-audio.mp4').getAttribute('data-media-id');
  expect(id).toBeTruthy();
  await page.evaluate(async (mediaId) => {
    await window.__clipforge!.flushAutosave();
    await window.__clipforge!.removeMedia(mediaId);
  }, id as string);
  expect(await page.evaluate(() => window.__clipforge!.listMediaIds())).not.toContain(id);
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  const [a, b] = await clips(page);
  expect(a.missing).toBe(true);
  expect(b.missing).toBe(false);
  await expect(mediaItem(page, 'with-audio.mp4')).toContainText('Missing');
  expect(errors).toEqual([]);
});

test('keyboard shortcuts drive play, split and undo; ignored inside the format select', async ({ page }) => {
  await setup(page);
  await clearSelection(page);
  await page.keyboard.press('Space');
  expect((await editorState(page)).playing).toBe(true);
  await page.keyboard.press('Space');
  expect((await editorState(page)).playing).toBe(false);

  await setPlayhead(page, 1);
  await page.keyboard.press('s');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  await page.keyboard.press('ControlOrMeta+Shift+z');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);

  // With a clip selected and the playhead inside it, every shortcut below would change the project.
  const [first] = await clips(page);
  await clipEl(page, first.id).click();
  const before = await editorState(page);
  expect(before.selection).toEqual([first.id]);
  await page.getByTestId('format-select').focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('ControlOrMeta+z');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  const after = await editorState(page);
  expect(after.format).toEqual(before.format);
  expect(after.undoDepth).toBe(before.undoDepth);
  expect(after.selection).toEqual(before.selection);
  expect(after.playing).toBe(false);

  // Focus left on the (hidden) file input does not swallow shortcuts.
  await page.getByTestId('file-input').focus();
  await page.keyboard.press('s');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
});

test('undo drops selected clips it removes; split, delete and redo stay usable', async ({ page }) => {
  await setup(page);
  await clearSelection(page);
  await setPlayhead(page, 1);
  await page.getByTestId('btn-split').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  const right = (await clips(page))[1];
  expect(Math.abs(right.left - PPS)).toBeLessThanOrEqual(2);
  await clipEl(page, right.id).click();
  await expect(page.getByTestId('btn-delete')).toBeEnabled();

  await page.getByTestId('btn-undo').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);
  expect((await editorState(page)).selection).toEqual([]);
  await expect(page.getByTestId('btn-delete')).toBeDisabled();
  await page.keyboard.press('Delete');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);

  await page.getByTestId('btn-redo').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  expect((await editorState(page)).selection).toEqual([]);
  await page.getByTestId('btn-undo').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);

  // With the stale id gone, S falls back to splitting the clip under the playhead.
  await page.keyboard.press('s');
  await expect(page.getByTestId('timeline-clip')).toHaveCount(3);
  await page.getByTestId('btn-merge').click();
  await expect(page.getByTestId('error-toast')).toHaveCount(1);
  await expect(page.getByTestId('error-toast')).toContainText('Select at least two clips to join');
  await expect(page.getByTestId('error-toast').filter({ hasText: /Clip not found|Move the playhead/ })).toHaveCount(0);
});

test('without WebCodecs a banner shows and import is disabled', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).VideoDecoder;
  });
  await page.goto('/');
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('banner-no-webcodecs')).toHaveText(
    'Your browser is missing: WebCodecs video decoding. Use a recent desktop Chrome.',
  );
  await expect(page.getByTestId('file-input')).toBeDisabled();
});
