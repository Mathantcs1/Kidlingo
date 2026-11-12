// Plan 5 Task 9 (continued): Escape/focus, several selected keys, hold, locked track, the inspector entry points and
// the chroma key colour's three refs. Helpers: ease-helpers.ts.
import { test, expect } from '@playwright/test';
import { curveD, diamond, fps, handle, keys, num, editor, opacityAt, openOn, setTime, setup } from './ease-helpers';
import { undoDepth } from './pip-helpers';

test.setTimeout(90_000);

test('Escape closes without a change and focus returns to the diamond (also mid-drag and with a typed number)', async ({ page }) => {
  await setup(page);
  await openOn(page, 0.4);
  const d = await undoDepth(page);
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveCount(0);
  await expect(diamond(page, 0.4)).toBeFocused();
  expect(await undoDepth(page)).toBe(d);
  await expect(page.getByTestId('keyframe-diamond').first()).toHaveAttribute('data-selected', 'true'); // the key selection survives
  await openOn(page, 0.4);
  await num(page, 'x1').fill('0.9');
  await page.keyboard.press('Escape');
  await expect(editor(page)).toHaveCount(0);
  expect(await undoDepth(page)).toBe(d);
  expect((await keys(page, 'opacity'))[0].kind).toBe('linear');
  await openOn(page, 0.4);
  const b = (await handle(page, 1).boundingBox())!;
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + 50, b.y - 30, { steps: 5 });
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(editor(page)).toHaveCount(0);
  expect(await undoDepth(page)).toBe(d);
  expect((await keys(page, 'opacity'))[0].kind).toBe('linear');
});

test('several selected keys take the ease in ONE step (every property at those times); one undo restores all', async ({ page }) => {
  await setup(page);
  const d = await undoDepth(page);
  await diamond(page, 0.4).click();
  await diamond(page, 1.6).click({ modifiers: ['Shift'] });
  await diamond(page, 1.6).focus();
  await page.keyboard.press('Enter');
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).toContainText('4 keyframes');
  await page.getByTestId('ease-preset-easeOut').click();
  expect(await undoDepth(page)).toBe(d + 1);
  expect((await keys(page, 'opacity')).map((e) => e.kind)).toEqual(['easeOut', 'easeOut', 'linear']);
  expect((await keys(page, 'scale')).map((e) => e.kind)).toEqual(['easeOut', 'easeOut']);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ControlOrMeta+z');
  expect((await keys(page, 'opacity')).map((e) => e.kind)).toEqual(['linear', 'linear', 'linear']);
  expect((await keys(page, 'scale')).map((e) => e.kind)).toEqual(['linear', 'linear']);
});

test('hold shows a step and the preview jumps at the next key frame', async ({ page }) => {
  await setup(page);
  await openOn(page, 0.4);
  const d = await undoDepth(page);
  await page.getByTestId('ease-preset-hold').click();
  expect(await undoDepth(page)).toBe(d + 1);
  await expect(page.getByTestId('ease-curve')).toHaveAttribute('data-kind', 'hold');
  expect(await curveD(page)).toMatch(/H.*V/);
  await expect(handle(page, 1)).toHaveCount(0);
  await expect(num(page, 'x1')).toBeDisabled();
  const f = await fps(page);
  expect(await opacityAt(page, 1.6 - 1 / f)).toBeLessThan(0.02);
  expect(await opacityAt(page, 1.6)).toBeGreaterThan(0.98);
  await page.getByTestId('ease-preset-bezier').click(); // Custom from a hold starts from a CSS ease
  expect((await keys(page, 'opacity'))[0].kind).toBe('bezier');
});

test('a locked track shows the editor read-only', async ({ page }) => {
  await setup(page, { locked: true });
  const d = await undoDepth(page);
  await openOn(page, 0.4);
  await expect(editor(page)).toContainText('Track is locked');
  await expect(page.getByTestId('ease-preset-easeIn')).toBeDisabled();
  await expect(num(page, 'x1')).toBeDisabled();
  await expect(handle(page, 1)).toHaveAttribute('aria-disabled', 'true');
  await handle(page, 1).focus();
  await page.keyboard.press('ArrowRight');
  expect(await undoDepth(page)).toBe(d);
  expect((await keys(page, 'opacity'))[0].kind).toBe('linear');
});

test('the inspector row opens the editor for its own property at the playhead; a strip key opens it on double-click', async ({ page }) => {
  await setup(page, { opacityEase: { kind: 'bounce' } });
  await setTime(page, 0.2);
  const opacityRow = page.locator('.kf-row', { has: page.getByTestId('kf-toggle-opacity') });
  const scaleRow = page.locator('.kf-row', { has: page.getByTestId('kf-toggle-scale') });
  await expect(opacityRow.getByTestId('kf-ease-open')).toHaveAttribute('aria-disabled', 'true');
  await setTime(page, 0.4);
  const d = await undoDepth(page);
  await opacityRow.getByTestId('kf-ease-open').click();
  await expect(editor(page)).toBeVisible();
  await expect(editor(page)).toContainText('Ease of keyframe');
  await expect(page.getByTestId('ease-preset-bounce')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('ease-preset-elastic').click();
  expect(await undoDepth(page)).toBe(d + 1);
  expect((await keys(page, 'opacity'))[0].kind).toBe('elastic');
  expect((await keys(page, 'scale'))[0].kind).toBe('linear'); // only this property
  await page.getByTestId('ease-close').click();
  await expect(editor(page)).toHaveCount(0);
  await scaleRow.getByTestId('kf-strip-key').nth(1).dblclick();
  await expect(editor(page)).toBeVisible();
  await page.getByTestId('ease-preset-back').click();
  expect((await keys(page, 'scale')).map((e) => e.kind)).toEqual(['linear', 'back']);
});

test('the chroma key colour: all three refs of a key time take the ease together', async ({ page }) => {
  await setup(page);
  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    const lin = { kind: 'linear' as const };
    const k = (a: number, b: number) => [{ t: 0.4, v: a, ease: lin }, { t: 1.6, v: b, ease: lin }];
    s.apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => (t.id !== 'v2' ? t : {
        ...t,
        clips: t.clips.map((c) => ({ ...c, effects: [{ id: 'ck', type: 'chromaKey' as const, enabled: true, params: { keyR: 0, keyG: 1, keyB: 0, similarity: 0.3, smoothness: 0.1, spill: 0.1 }, keys: { keyR: k(0, 1), keyG: k(1, 0), keyB: k(0, 1) } }] })),
      })),
    }));
  });
  const d = await undoDepth(page);
  await diamond(page, 1.6).click();
  await diamond(page, 1.6).focus();
  await page.keyboard.press('Enter');
  await page.getByTestId('ease-preset-easeInOut').click();
  expect(await undoDepth(page)).toBe(d + 1);
  const ck = await page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === 'pip')!.effects[0].keys!);
  for (const p of ['keyR', 'keyG', 'keyB']) expect(ck[p].map((x) => x.ease.kind)).toEqual(['linear', 'easeInOut']);
});
