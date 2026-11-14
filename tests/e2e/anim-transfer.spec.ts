// Plan 5B Task 9 (D8): copy/paste of timeline keys and of a whole animation. Keys: select two diamonds, Ctrl+C, select
// another clip, move the playhead, Ctrl+V => the keys land there in ONE step (pixels follow). Text fields keep native
// copy/paste. Copy/Paste animation between two clips of different size adapts the scale (edges of the picture).
// New project clears the clipboard.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { trackErrors } from './helpers';
import { expectPixel, isBlue, isGreen, isYellow, pixelAt, setupPip, undoDepth } from './pip-helpers';

test.setTimeout(90_000);

const lin = { kind: 'linear' as const };
const C = { x: 960, y: 540 };
const project = (page: Page) => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));
const clipOf = (page: Page, id: string) =>
  page.evaluate((id) => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === id), id);
const select = (page: Page, ids: string[]) => page.evaluate((ids) => window.__clipforge!.getState().select(ids), ids);
const playhead = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
const diamond = (page: Page, time: number) => page.locator(`[data-testid="keyframe-diamond"][data-time="${time.toFixed(4)}"]`);

/** pip (200×200, layer v2, 0..2 s, scale keys 1 @ 0.5 s and 3 @ 1.5 s) and 'pip2' (same media, layer v3, 2.5..4.5 s, static). */
async function setupKeys(page: Page): Promise<void> {
  await setupPip(page, 'green');
  await page.evaluate((lin) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => {
      const pip = p.tracks.find((t) => t.id === 'v2')!.clips[0];
      const keyed = { ...pip, keys: { scale: [{ t: 0.5, v: 1, ease: lin }, { t: 1.5, v: 3, ease: lin }], opacity: [{ t: 0.5, v: 1, ease: lin }, { t: 1.5, v: 1, ease: lin }] } };
      const second = { ...pip, id: 'pip2', start: 2.5, out: 2 };
      const v3 = { ...p.tracks[1], id: 'v3', clips: [second] };
      return { ...p, tracks: [p.tracks[0], { ...p.tracks[1], clips: [keyed] }, v3, p.tracks[2]] };
    });
    s.select(['pip']);
    s.setPlayhead(0.2);
    (document.activeElement as HTMLElement | null)?.blur();
  }, lin);
  await expect(page.getByTestId('keyframe-diamond')).toHaveCount(2);
}

async function pickBothDiamonds(page: Page): Promise<void> {
  await diamond(page, 0.5).click();
  await diamond(page, 1.5).click({ modifiers: ['Shift'] });
}

test('select keys, Ctrl+C, select another clip, move the playhead, Ctrl+V: the keys land there in ONE step, pixels follow', async ({ page }) => {
  const errors = trackErrors(page);
  await setupKeys(page);
  await pickBothDiamonds(page);
  await expect(page.getByTestId('kf-copy')).toBeEnabled();
  await page.keyboard.press('Control+c');
  await expect(page.getByTestId('kf-paste')).toBeEnabled();
  await select(page, ['pip2']);
  expect((await clipOf(page, 'pip2'))?.keys).toBeUndefined();
  await playhead(page, 3);
  const d0 = await undoDepth(page);
  await page.keyboard.press('Control+v');
  expect(await undoDepth(page)).toBe(d0 + 1);
  const keys = (await clipOf(page, 'pip2'))!.keys!;
  expect(keys.scale!.map((k) => [k.t, k.v])).toEqual([[0.5, 1], [1.5, 3]]); // relative timing kept, earliest on the playhead (local 0.5)
  expect(keys.opacity!.map((k) => k.t)).toEqual([0.5, 1.5]);
  // Pixels: pip2 is 200 px wide at timeline 3.0 and 600 px wide at 4.0 (the original clip is long gone).
  await playhead(page, 3);
  await expectPixel(page, C.x + 250, C.y, isBlue, 'scale 1 at 3.0 s');
  await expectPixel(page, C.x, C.y, isGreen, 'centre at 3.0 s');
  await playhead(page, 4);
  await expectPixel(page, C.x + 250, C.y, isGreen, 'scale 3 at 4.0 s');
  await expectPixel(page, C.x + 350, C.y, isBlue, 'outside at 4.0 s');
  // One undo removes them all.
  await page.getByTestId('btn-undo').click();
  expect((await clipOf(page, 'pip2'))?.keys).toBeUndefined();
  expect(await undoDepth(page)).toBe(d0);
  expect(errors).toEqual([]);
});

test('Ctrl/Cmd+C and V inside a text field stay native: no keys are copied or pasted, the project is untouched', async ({ page }) => {
  const errors = trackErrors(page);
  await setupKeys(page);
  await pickBothDiamonds(page);
  await page.keyboard.press('Control+c'); // the keys are on the clipboard
  await expect(page.getByTestId('kf-paste')).toBeEnabled();
  await playhead(page, 1); // a paste here would add a key at 1.0 s to the selected clip
  const before = await project(page);
  await page.getByTestId('track-name').first().dblclick();
  const input = page.getByTestId('track-name-input');
  await input.fill('Hello');
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+c'); // copies TEXT
  await page.keyboard.press('End');
  await page.keyboard.press('Control+v'); // pastes TEXT
  await expect(input).toHaveValue('HelloHello');
  await page.keyboard.press('Escape');
  expect(await project(page)).toBe(before);
  // Outside the field the same chord pastes the keys again (one step).
  await page.mouse.click(5, 5);
  const d0 = await undoDepth(page);
  await page.keyboard.press('Control+v');
  expect(await undoDepth(page)).toBe(d0 + 1);
  expect((await clipOf(page, 'pip'))!.keys!.scale!.map((k) => k.t)).toContain(1);
  expect(errors).toEqual([]);
});

test('Copy animation / Paste animation between a square and a wide picture adapts the scale; edges, one undo step, shortcuts', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page, 'split'); // 300×100 red|yellow: fit scale 6.4; the animation comes from a 200×200 square (fit scale 5.4)
  await page.evaluate((lin) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => {
      const pip = p.tracks.find((t) => t.id === 'v2')!.clips[0];
      const square = Object.values(p.media).find((m) => m.name === 'green.png')!;
      const src = { ...pip, id: 'src', mediaId: square.id, start: 0, out: 2, transform: { x: 0, y: 0, scale: 5.4, rotation: 0, opacity: 1 },
        keys: { scale: [{ t: 0, v: 2.7, ease: lin }, { t: 1, v: 5.4, ease: lin }], opacity: [{ t: 0, v: 1, ease: lin }, { t: 1, v: 1, ease: lin }] } };
      const dst = { ...pip, id: 'dst', start: 2.5, out: 2, transform: { x: 0, y: 0, scale: 6.4, rotation: 0, opacity: 1 } };
      return { ...p, tracks: [p.tracks[0], { ...p.tracks[1], clips: [src] }, { ...p.tracks[1], id: 'v3', clips: [dst] }, p.tracks[2]] };
    });
    s.select(['src']);
    (document.activeElement as HTMLElement | null)?.blur();
  }, lin);
  await expect(page.getByTestId('anim-paste')).toBeDisabled();
  await page.getByTestId('anim-copy').click();
  await expect(page.getByTestId('anim-paste')).toBeEnabled();
  await select(page, ['dst']);
  const d0 = await undoDepth(page);
  await page.getByTestId('anim-paste').click();
  expect(await undoDepth(page)).toBe(d0 + 1);
  const scale = (await clipOf(page, 'dst'))!.keys!.scale!;
  expect(scale.map((k) => k.t)).toEqual([0, 1]);
  expect(scale[0].v).toBeCloseTo(3.2, 9); // 2.7 x 6.4 / 5.4: the same zoom relative to the frame
  expect(scale[1].v).toBeCloseTo(6.4, 9);
  // Edges of the picture (yellow right half): half width 480 px at 2.5 s (scale 3.2), 720 px at 3.0 s (scale 4.8).
  await playhead(page, 2.5);
  await expectPixel(page, C.x + 470, C.y, isYellow, 'inside at 2.5 s');
  await expectPixel(page, C.x + 490, C.y, isBlue, 'outside at 2.5 s');
  await playhead(page, 3);
  await expectPixel(page, C.x + 710, C.y, isYellow, 'inside at 3.0 s');
  await expectPixel(page, C.x + 730, C.y, isBlue, 'outside at 3.0 s');
  // Undo restores; the shortcuts do the same (Ctrl+Alt+C / Ctrl+V pastes what was copied last: the animation).
  await page.getByTestId('btn-undo').click();
  expect((await clipOf(page, 'dst'))?.keys).toBeUndefined();
  await select(page, ['src']);
  await page.keyboard.press('Control+Alt+c');
  await select(page, ['dst']);
  await page.keyboard.press('Control+v');
  expect(await undoDepth(page)).toBe(d0 + 1);
  expect((await clipOf(page, 'dst'))!.keys!.scale!.map((k) => k.t)).toEqual([0, 1]);
  await page.getByTestId('btn-undo').click();
  await page.keyboard.press('Control+Alt+v');
  expect((await clipOf(page, 'dst'))!.keys!.scale).toHaveLength(2);
  expect(await pixelAt(page, C.x, C.y)).toBeTruthy();
  expect(errors).toEqual([]);
});

test('New project clears the animation clipboard', async ({ page }) => {
  const errors = trackErrors(page);
  await setupKeys(page);
  await page.getByTestId('anim-copy').click();
  await pickBothDiamonds(page);
  await page.keyboard.press('Control+c');
  await expect(page.getByTestId('anim-paste')).toBeEnabled();
  await expect(page.getByTestId('kf-paste')).toBeEnabled();
  await page.getByTestId('btn-new-project').click();
  await page.getByTestId('btn-confirm-ok').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(0);
  await page.evaluate((lin) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.kind === 'video' ? { ...t, clips: [{
      id: 'ov', mediaId: '', kind: 'overlay' as const, start: 0, in: 0, out: 3, volume: 1, fit: 'fit' as const, blend: 'normal' as const, effects: [],
      audio: { fadeIn: 0, fadeOut: 0, pan: 0, silent: false, effects: [] }, transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
      overlay: { type: 'sticker' as const, text: '', subtext: '', colour: '#ffffff', accent: '#ff0000', sticker: 'star' as const },
      keys: { opacity: [{ t: 0, v: 0, ease: lin }, { t: 1, v: 1, ease: lin }] },
    }] } : t)) }));
    s.select(['ov']);
  }, lin);
  await expect(page.getByTestId('anim-copy')).toBeEnabled();
  await expect(page.getByTestId('anim-paste')).toBeDisabled();
  await expect(page.getByTestId('kf-paste')).toBeDisabled();
  await page.keyboard.press('Control+v'); // nothing copied any more: no effect, no error
  expect((await clipOf(page, 'ov'))!.keys!.opacity).toHaveLength(2);
  expect(errors).toEqual([]);
});
