import { test, expect } from '@playwright/test';
import { addKey, audioInfo, KEY, openDialog, snapshot, stubTts } from './ai-voice-helpers';
import { clipStates, importFiles, mediaItem, noAudio, open, playerState, setPlayhead, toast, trackErrors } from './helpers';

test.setTimeout(150_000);

const SCRIPT = 'Hello from ClipForge.';

async function withVideo(page: import('@playwright/test').Page): Promise<void> {
  await open(page);
  await importFiles(page, [noAudio], 1);
  await mediaItem(page, 'no-audio.mp4').getByTestId('btn-add-to-timeline').click();
  await setPlayhead(page, 1);
}

/** Types the script, presses Generate and answers the one-time consent question. */
async function generate(page: import('@playwright/test').Page, text = SCRIPT, consent = true): Promise<void> {
  await page.getByTestId('ai-voice-text').fill(text);
  await page.getByTestId('ai-voice-generate').click();
  if (consent) await page.getByTestId('btn-confirm-ok').click();
}

test('without a key the button looks disabled, explains why and opens Settings', async ({ page }) => {
  await stubTts(page);
  await open(page);
  const btn = page.getByTestId('btn-ai-voice');
  await expect(btn).toHaveAttribute('aria-disabled', 'true');
  await expect(btn).toHaveAttribute('title', /ElevenLabs API key in Settings/);
  await btn.click({ force: true }); // Playwright treats aria-disabled as disabled; a real click works
  await expect(page.getByTestId('settings-dialog')).toBeVisible();
  await expect(page.getByTestId('ai-voice-dialog')).toHaveCount(0);
});

test('generates speech at the playhead: consent once, exact request, one undo step, survives reload', async ({ page }) => {
  const errors = trackErrors(page);
  const tts = await stubTts(page);
  await withVideo(page);
  await addKey(page);
  await expect(page.getByTestId('btn-ai-voice')).not.toHaveAttribute('aria-disabled', 'true');
  const { playhead } = await playerState(page);
  const before = await snapshot(page);

  await openDialog(page);
  await expect(page.getByTestId('ai-voice-voice').locator('option')).toHaveText(['Rachel', 'Adam']);
  await expect(page.getByTestId('ai-voice-model')).toHaveValue('eleven_multilingual_v2');
  await page.getByTestId('ai-voice-voice').selectOption({ label: 'Adam' });
  await page.getByTestId('ai-voice-text').fill(SCRIPT);
  await expect(page.getByTestId('ai-voice-count')).toHaveText(`${[...SCRIPT].length} / 5,000`);
  await page.getByTestId('ai-voice-generate').click();
  // Consent first: the request is not sent until the user accepts.
  await expect(page.getByTestId('confirm-dialog')).toContainText('ElevenLabs');
  expect(tts.calls).toHaveLength(0);
  await page.getByTestId('btn-confirm-ok').click();
  await expect(page.getByTestId('ai-voice-dialog')).toHaveCount(0);

  expect(tts.calls).toHaveLength(1);
  expect(tts.calls[0].url).toContain('/v1/text-to-speech/v2');
  expect(tts.calls[0].body).toEqual({ text: SCRIPT, model_id: 'eleven_multilingual_v2' });
  expect(tts.calls[0].key).toBe(KEY);
  await expect(mediaItem(page, 'AI voice 1')).toHaveCount(1);
  const clip = (await clipStates(page)).find((c) => c.trackKind === 'audio')!;
  expect(clip.start).toBe(playhead);
  expect(Math.abs(clip.out - clip.in - 1)).toBeLessThan(0.15);
  expect((await playerState(page)).undoDepth).toBe(before.depth + 1);

  // Consent is remembered: a second take (flash model) goes straight out and is numbered 2.
  await openDialog(page);
  await page.getByTestId('ai-voice-voice').selectOption({ label: 'Adam' }); // remembered anyway
  await page.getByTestId('ai-voice-model').selectOption('eleven_flash_v2_5');
  await generate(page, 'Second take.', false);
  await expect(page.getByTestId('ai-voice-dialog')).toHaveCount(0);
  await expect(page.getByTestId('confirm-dialog')).toHaveCount(0);
  await expect(mediaItem(page, 'AI voice 2')).toHaveCount(1);
  expect(tts.calls[1].body).toEqual({ text: 'Second take.', model_id: 'eleven_flash_v2_5' });

  await page.getByTestId('btn-undo').click();
  await expect(mediaItem(page, 'AI voice 2')).toHaveCount(0);
  await page.getByTestId('btn-undo').click();
  expect(await snapshot(page)).toEqual(before);
  await expect(mediaItem(page, 'AI voice 1')).toHaveCount(0);
  await page.getByTestId('btn-redo').click();
  await page.getByTestId('btn-redo').click();

  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(mediaItem(page, 'AI voice 1')).toHaveCount(1);
  expect((await clipStates(page)).filter((c) => c.trackKind === 'audio')).toHaveLength(2);
  expect(errors).toEqual([]);
});

test('the script limit is 5,000 characters: Generate is disabled above it and the count shows an error', async ({ page }) => {
  await stubTts(page);
  await open(page);
  await addKey(page);
  await openDialog(page);
  const gen = page.getByTestId('ai-voice-generate');
  await expect(gen).toBeDisabled(); // blank
  await page.getByTestId('ai-voice-text').fill('   ');
  await expect(gen).toBeDisabled();
  await page.getByTestId('ai-voice-text').fill('a'.repeat(5000));
  await expect(gen).toBeEnabled();
  await expect(page.getByTestId('ai-voice-count')).not.toHaveClass(/is-error/);
  await page.getByTestId('ai-voice-text').fill('a'.repeat(5001));
  await expect(gen).toBeDisabled();
  await expect(page.getByTestId('ai-voice-count')).toHaveClass(/is-error/);
  await expect(page.getByTestId('ai-voice-count')).toHaveText('5,001 / 5,000');
  // Emoji count as one character each (code points), like the API.
  await page.getByTestId('ai-voice-text').fill('😀'.repeat(5000));
  await expect(gen).toBeEnabled();
});

const FAILURES: [401 | 402 | 429 | 'network', RegExp][] = [
  [401, /did not accept your API key/],
  [402, /run out of characters/],
  [429, /rate limiting/],
  ['network', /Could not reach ElevenLabs/],
];

test('API failures show a plain toast, never the key, and change nothing', async ({ page }) => {
  const tts = await stubTts(page);
  await withVideo(page);
  await addKey(page);
  const before = await snapshot(page);
  await openDialog(page);
  let consent = true;
  for (const [mode, message] of FAILURES) {
    tts.mode = mode;
    await generate(page, SCRIPT, consent);
    consent = false;
    await expect(toast(page).last().locator('span')).toHaveText(message);
    expect(await toast(page).allTextContents()).not.toContain(KEY);
    await expect(page.getByTestId('ai-voice-dialog')).toBeVisible();
    await expect(page.getByTestId('ai-voice-generate')).toBeEnabled();
    expect(await snapshot(page)).toEqual(before);
    await page.locator('.toast-close').first().click({ timeout: 2000 }).catch(() => undefined);
  }
  expect(await page.content()).not.toContain(KEY);
  await expect(page.getByTestId('media-item')).toHaveCount(1);
});

test('Cancel mid-request adds nothing, not even later; a double click sends one request', async ({ page }) => {
  const tts = await stubTts(page);
  await withVideo(page);
  await addKey(page);
  const before = await snapshot(page);
  tts.mode = 'slow';
  await openDialog(page);
  await page.getByTestId('ai-voice-text').fill(SCRIPT);
  await page.getByTestId('ai-voice-generate').dblclick();
  await page.getByTestId('btn-confirm-ok').click();
  await expect(page.getByTestId('ai-voice-status')).toHaveText('Generating…');
  await expect(page.getByTestId('ai-voice-generate')).toBeDisabled();
  await expect.poll(() => tts.calls.length).toBe(1);
  await page.getByTestId('ai-voice-cancel').click();
  await expect(page.getByTestId('ai-voice-dialog')).toHaveCount(0);
  await page.waitForTimeout(3500);
  expect(tts.calls).toHaveLength(1);
  expect(await snapshot(page)).toEqual(before);
  await expect(page.getByTestId('media-item')).toHaveCount(1);
  await expect(toast(page)).toHaveCount(0);
  // Escape cancels too, and the app is usable again afterwards.
  await openDialog(page);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('ai-voice-dialog')).toHaveCount(0);
  await expect(page.getByTestId('btn-ai-voice')).toBeFocused();
});

test('the exported MP4 contains the generated speech', async ({ page }) => {
  await stubTts(page);
  await withVideo(page);
  await addKey(page);
  await openDialog(page);
  await generate(page);
  await expect(mediaItem(page, 'AI voice 1')).toHaveCount(1);
  await page.getByTestId('btn-export').click();
  await page.getByTestId('btn-export-start').click();
  const link = page.getByTestId('export-download');
  await expect(link).toBeVisible({ timeout: 120_000 });
  const [download] = await Promise.all([page.waitForEvent('download'), link.click()]);
  const { codec, rms } = audioInfo(await download.path());
  console.log(`export audio: ${codec}, RMS ${rms.toFixed(1)} dB`);
  expect(codec).toBe('aac');
  expect(rms).toBeGreaterThan(-60);
});
