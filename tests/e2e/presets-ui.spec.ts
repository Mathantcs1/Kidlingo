// Plan 5B Task 7: the inspector's Animation section (§7): choosing a preset from the browser is ONE undo step and the
// preview draws it (pixel against the resolver); settings commit once per release / press; remove is one step that
// undo restores exactly; emphasis "at playhead"; per-kind rules (adjustment layers only fade, overlays get presets,
// audio none) and the locked track.
import { test, expect } from '@playwright/test';
import { resolveClip } from '../../src/core/animate';
import { trackErrors } from './helpers';
import { pixelAt, setupPip } from './pip-helpers';
import { clipJson, depth, openBrowser, setupOverlay } from './presets-ui-helpers';

test.setTimeout(90_000);

test('Fade In from the browser: ONE undo step, and the preview at 25 % of the window matches the resolver', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const d0 = await depth(page);
  await openBrowser(page, 'in');
  await page.getByTestId('preset-tile-fade').click();
  await expect(page.getByTestId('preset-browser')).toHaveCount(0);
  await expect(page.getByTestId('anim-choose-in')).toBeFocused();
  expect(await depth(page)).toBe(d0 + 1);
  await expect(page.getByTestId('anim-in-name')).toHaveText('Fade');
  const clip = await clipJson(page, 'pip');
  expect(clip.motion?.in).toEqual({ preset: 'fade', duration: 0.5, delay: 0, ease: { kind: 'easeOut' }, params: {} });
  // 25 % of the 0.5 s window, on the frame grid.
  const t = 0.125;
  await page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
  const o = resolveClip(clip, t, { width: 1920, height: 1080, fps: 30 }).transform.opacity;
  expect(o).toBeGreaterThan(0.2);
  expect(o).toBeLessThan(0.8);
  // Lime over blue at opacity o.
  await expect.poll(async () => {
    const [r, g, b] = await pixelAt(page, 960, 540);
    return Math.max(Math.abs(r), Math.abs(g - 255 * o), Math.abs(b - 255 * (1 - o)));
  }).toBeLessThanOrEqual(6);
  // Undo removes the preset exactly.
  await page.getByTestId('btn-undo').click();
  expect((await clipJson(page, 'pip')).motion).toBeUndefined();
  expect(errors).toEqual([]);
});

test('direction, duration (slider drag) and delay each commit ONE step per release', async ({ page }) => {
  const errors = trackErrors(page);
  await setupOverlay(page);
  await openBrowser(page, 'in');
  await page.getByTestId('preset-tile-slide').click();
  let d = await depth(page);
  await page.getByTestId('anim-in-direction-2').click();
  expect(await depth(page)).toBe(d + 1);
  expect((await clipJson(page, 'st')).motion!.in!.params.direction).toBe(2);
  await expect(page.getByTestId('anim-in-direction-2')).toHaveAttribute('aria-checked', 'true');
  // A pointer drag across the duration slider: many input events, ONE change, ONE step.
  d = await depth(page);
  const box = (await page.getByTestId('anim-in-duration').boundingBox())!;
  await page.mouse.move(box.x + 4, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, { steps: 6 });
  await page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 6 });
  expect(await depth(page)).toBe(d);
  await page.mouse.up();
  expect(await depth(page)).toBe(d + 1);
  const dur = (await clipJson(page, 'st')).motion!.in!.duration;
  expect(dur).toBeGreaterThan(1);
  await expect(page.getByTestId('anim-in-duration')).toHaveValue(String(dur));
  d = await depth(page);
  await page.getByTestId('anim-in-delay').fill('0.5');
  expect(await depth(page)).toBe(d + 1);
  expect((await clipJson(page, 'st')).motion!.in!.delay).toBe(0.5);
  // The ease select: one step per choice.
  await page.getByTestId('anim-in-ease').selectOption('bounce');
  expect(await depth(page)).toBe(d + 2);
  expect((await clipJson(page, 'st')).motion!.in!.ease).toEqual({ kind: 'bounce' });
  // Swapping to Whip keeps the delay and direction (T7-1), resets the rest.
  await openBrowser(page, 'in');
  await page.getByTestId('preset-tile-whip').click();
  const w = (await clipJson(page, 'st')).motion!.in!;
  expect([w.preset, w.delay, w.params.direction, w.duration]).toEqual(['whip', 0.5, 2, 0.4]);
  expect(await depth(page)).toBe(d + 3);
  expect(errors).toEqual([]);
});

test('remove is ONE step and undo restores the slot exactly (JSON); redo removes it again', async ({ page }) => {
  const errors = trackErrors(page);
  await setupOverlay(page);
  await openBrowser(page, 'out');
  await page.getByTestId('preset-tile-zoom').click();
  await page.getByTestId('anim-out-from').fill('2.5');
  const before = await clipJson(page, 'st');
  const d = await depth(page);
  await page.getByTestId('anim-remove-out').click();
  expect(await depth(page)).toBe(d + 1);
  expect((await clipJson(page, 'st')).motion).toBeUndefined();
  await expect(page.getByTestId('anim-out-name')).toHaveText('None');
  await page.getByTestId('btn-undo').click();
  expect(JSON.stringify(await clipJson(page, 'st'))).toBe(JSON.stringify(before));
  await expect(page.getByTestId('anim-out-from')).toHaveValue('2.5');
  await page.getByTestId('btn-redo').click();
  expect((await clipJson(page, 'st')).motion).toBeUndefined();
  expect(errors).toEqual([]);
});

test('emphasis "at playhead" sets `at` to the playhead (one step); off the clip it is refused', async ({ page }) => {
  const errors = trackErrors(page);
  await setupOverlay(page);
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(0.5));
  await openBrowser(page, 'emphasis');
  await page.getByTestId('preset-tile-pulse').click();
  expect((await clipJson(page, 'st')).motion!.emphasis!.at).toBe(0.5);
  await expect(page.getByTestId('anim-emphasis-at')).toHaveText('0.5 s');
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(2.2));
  const d = await depth(page);
  await page.getByTestId('anim-emphasis-here').click();
  expect(await depth(page)).toBe(d + 1);
  expect((await clipJson(page, 'st')).motion!.emphasis!.at).toBeCloseTo(2.2, 9);
  await expect(page.getByTestId('anim-emphasis-at')).toHaveText('2.2 s');
  await page.evaluate(() => window.__clipforge!.getState().setPlayhead(4.5));
  await page.getByTestId('anim-emphasis-here').click();
  expect(await depth(page)).toBe(d + 1);
  await expect(page.getByTestId('error-toast')).toContainText('place the emphasis');
  expect(errors).toEqual([]);
});

test('adjustment layer: only opacity presets enabled; overlays get presets; audio clips have none', async ({ page }) => {
  const errors = trackErrors(page);
  await setupOverlay(page);
  await page.evaluate(() => { const s = window.__clipforge!.getState(); s.select(['adj']); s.setPlayhead(6); });
  await openBrowser(page, 'in');
  await expect(page.getByTestId('preset-tile-fade')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('preset-tile-slide')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('preset-tile-slide')).toHaveAttribute('title', 'Adjustment layers only fade');
  const d = await depth(page);
  // aria-disabled: a click (forced past Playwright's enabled check) applies nothing.
  await page.getByTestId('preset-tile-slide').click({ force: true });
  expect(await depth(page)).toBe(d);
  await expect(page.getByTestId('preset-browser')).toBeVisible();
  await page.getByTestId('preset-cat-loop').click();
  await expect(page.getByTestId('preset-tile-blink')).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('preset-tile-float')).toHaveAttribute('aria-disabled', 'true');
  await page.getByTestId('preset-tile-blink').click();
  expect((await clipJson(page, 'adj')).motion!.loop!.preset).toBe('blink');
  // The sticker overlay takes any preset.
  await page.evaluate(() => window.__clipforge!.getState().select(['st']));
  await openBrowser(page, 'in');
  await page.getByTestId('preset-tile-pop').click();
  expect((await clipJson(page, 'st')).motion!.in!.preset).toBe('pop');
  // An audio clip has no Animation section.
  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === 'a1' ? { ...t, clips: [{ ...p.tracks[0].clips[0], id: 'au', kind: 'audio' as const, mediaId: '', overlay: undefined, motion: undefined }] } : t)) }));
    s.select(['au']);
  });
  await expect(page.getByTestId('anim-section')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a locked track disables every animation control (hidden tracks are fine)', async ({ page }) => {
  const errors = trackErrors(page);
  await setupOverlay(page);
  await openBrowser(page, 'in');
  await page.getByTestId('preset-tile-slide').click();
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === 'v1' ? { ...t, locked: true } : t)) })));
  for (const id of ['anim-choose-in', 'anim-choose-out', 'anim-remove-in', 'anim-in-duration', 'anim-in-delay', 'anim-in-direction-1', 'anim-in-ease']) {
    await expect(page.getByTestId(id)).toBeDisabled();
  }
  await expect(page.getByTestId('anim-choose-in')).toHaveAttribute('title', 'Track is locked');
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === 'v1' ? { ...t, locked: false, hidden: true } : t)) })));
  await expect(page.getByTestId('anim-choose-in')).toBeEnabled();
  expect(errors).toEqual([]);
});
