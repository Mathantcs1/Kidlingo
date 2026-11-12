// Plan 5 Task 9 fix round 1: field edits on mixed/preset eases, the last-key note, and Escape/Delete scope.
import { test, expect } from '@playwright/test';
import { diamond, editor, keys, num, openOn, setup } from './ease-helpers';
import { undoDepth } from './pip-helpers';

test.setTimeout(90_000);

test('typing a mixed selection\'s own first value sets ALL keys', async ({ page }) => {
  await setup(page, { opacityEase: { kind: 'bezier', bezier: [0.25, 0.1, 0.25, 1] } });
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id !== 'pip' ? c : { ...c, keys: { ...c.keys, scale: c.keys!.scale!.map((k, i) => (i === 0 ? { ...k, ease: { kind: 'bezier' as const, bezier: [0.5, 0, 0.5, 1] as [number, number, number, number] } } : k)) } })) })),
  })));
  await diamond(page, 0.4).click();
  await diamond(page, 0.4).focus();
  await page.keyboard.press('Enter');
  await expect(editor(page)).toContainText('The keys differ');
  const d = await undoDepth(page);
  const v = await num(page, 'x1').inputValue();
  await num(page, 'x1').fill(`${v}0`);
  await page.keyboard.press('Enter');
  expect(await undoDepth(page)).toBe(d + 1);
  const a = (await keys(page, 'scale'))[0].bezier![0];
  expect(a).toBe((await keys(page, 'opacity'))[0].bezier![0]);
  expect(a).toBe(Number(v));
});

test('typing the number a preset already has does not turn it into a custom curve', async ({ page }) => {
  await setup(page, { opacityEase: { kind: 'easeIn' } });
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({
    ...p,
    tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id !== 'pip' ? c : { ...c, keys: { ...c.keys, scale: c.keys!.scale!.map((k, i) => (i === 0 ? { ...k, ease: { kind: 'easeIn' as const } } : k)) } })) })),
  })));
  await openOn(page, 0.4);
  const d = await undoDepth(page);
  const v = await num(page, 'x1').inputValue();
  await num(page, 'x1').fill(`${v}0`);
  await page.keyboard.press('Enter');
  expect(await undoDepth(page)).toBe(d);
  expect((await keys(page, 'opacity'))[0].kind).toBe('easeIn');
});

test('the last key of a list says its ease needs a following key', async ({ page }) => {
  await setup(page);
  await openOn(page, 1.9);
  await expect(editor(page)).toContainText('Last key');
  await page.keyboard.press('Escape');
  await openOn(page, 0.4);
  await expect(editor(page)).not.toContainText('Last key');
});

test('Escape with focus on another control leaves the editor open', async ({ page }) => {
  await setup(page);
  await openOn(page, 0.4);
  await page.evaluate(() => {
    const b = [...document.querySelectorAll<HTMLElement>('button')].find((x) => !x.closest('[data-testid="ease-editor"]') && !x.matches('[data-testid="keyframe-diamond"]'));
    b!.focus();
  });
  await page.keyboard.press('Escape');
  await expect(editor(page)).toBeVisible();
});

test('Delete and Backspace on a focused preset do not delete the selected keys', async ({ page }) => {
  await setup(page);
  await openOn(page, 0.4);
  const d = await undoDepth(page);
  await page.getByTestId('ease-preset-easeIn').focus();
  await page.keyboard.press('Delete');
  await page.keyboard.press('Backspace');
  expect(await undoDepth(page)).toBe(d);
  expect((await keys(page, 'opacity')).length).toBe(3);
});
