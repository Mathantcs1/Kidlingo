// Plan 5B Task 8: the spring in the ease editor (D5): Spring and a named spring are ONE step each, the preview frame
// matches the core value (physical seconds of the segment), the fields commit on Enter or blur, and a spring that is
// still moving at the next key says so.
import { test, expect } from '@playwright/test';
import { easeAt } from '../../src/core/easing';
import type { Ease } from '../../src/core/easing';
import { SPRING_PRESETS } from '../../src/core/spring';
import { trackErrors } from './helpers';
import { undoDepth } from './pip-helpers';
import { curveD, editor, fractionAt, keys, near, opacityAt, openOn, setup } from './ease-helpers';

test.setTimeout(90_000);

const spring = (key: string) => SPRING_PRESETS.find((p) => p.key === key)!.spring;
const opacityEases = async (page: Parameters<typeof keys>[0]) => (await keys(page, 'opacity')) as Ease[];

test('Spring, then Bouncy: ONE step each; the preview frame follows the spring over the 1.2 s segment', async ({ page }) => {
  const errors = trackErrors(page);
  await setup(page);
  await openOn(page, 0.4);
  const d = await undoDepth(page);
  await page.getByTestId('ease-preset-spring').click();
  await expect.poll(() => undoDepth(page)).toBe(d + 1);
  expect((await opacityEases(page))[0]).toEqual({ kind: 'spring', spring: { stiffness: 170, damping: 26, mass: 1 } });
  await expect(page.getByTestId('ease-preset-spring')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('ease-spring-snappy')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('ease-spring-note')).toHaveCount(0); // snappy settles within 1.2 s
  await expect(page.getByTestId('ease-x1')).toHaveCount(0); // the Bézier fields give way to the spring's
  const snappyCurve = await curveD(page);
  await page.getByTestId('ease-spring-bouncy').click();
  await expect.poll(() => undoDepth(page)).toBe(d + 2);
  expect((await opacityEases(page))[0]).toEqual({ kind: 'spring', spring: spring('bouncy') });
  expect(await curveD(page)).not.toBe(snappyCurve);
  await page.getByTestId('ease-spring-bouncy').click(); // the same spring again: no step
  await page.getByTestId('ease-preset-spring').click(); // Spring on a spring keeps its parameters: no step
  await page.waitForTimeout(100);
  expect(await undoDepth(page)).toBe(d + 2);
  expect((await opacityEases(page))[0]).toEqual({ kind: 'spring', spring: spring('bouncy') });
  await page.getByTestId('ease-close').click();
  await expect(editor(page)).toHaveCount(0);
  // 0.1 s into the 1.2 s segment the bouncy spring has risen to about 0.55 (a linear ease would be 0.083).
  const u = await fractionAt(page, 0.5);
  const want = easeAt({ kind: 'spring', spring: spring('bouncy') }, u, 1.2);
  expect(want).toBeGreaterThan(0.4);
  expect(want).toBeLessThan(1);
  const got = await opacityAt(page, 0.5);
  console.log(`bouncy spring at 0.5 s: ${got.toFixed(4)} (core ${want.toFixed(4)})`);
  near(got, want, 2 / 255 + 0.005);
  expect(errors).toEqual([]);
});

test('spring fields commit on Enter and on blur (ONE step each, clamped); an unchanged value adds none', async ({ page }) => {
  await setup(page);
  await openOn(page, 0.4);
  await page.getByTestId('ease-preset-spring').click();
  const d = await undoDepth(page);
  const stiffness = page.getByTestId('ease-spring-stiffness');
  await stiffness.fill('300');
  expect(await undoDepth(page)).toBe(d); // typing alone commits nothing
  await stiffness.press('Enter');
  await expect.poll(() => undoDepth(page)).toBe(d + 1);
  expect((await opacityEases(page))[0].spring).toEqual({ stiffness: 300, damping: 26, mass: 1 });
  const damping = page.getByTestId('ease-spring-damping');
  await damping.fill('500'); // clamped to 100
  await damping.press('Tab');
  await expect.poll(() => undoDepth(page)).toBe(d + 2);
  expect((await opacityEases(page))[0].spring).toEqual({ stiffness: 300, damping: 100, mass: 1 });
  await page.getByTestId('ease-spring-mass').fill('1');
  await page.getByTestId('ease-spring-mass').press('Enter');
  await page.waitForTimeout(100);
  expect(await undoDepth(page)).toBe(d + 2);
  await expect(page.getByTestId('ease-spring-snappy')).toHaveAttribute('aria-pressed', 'false');
});

test('a wobbly spring on the short 0.3 s segment shows the "still moving" note', async ({ page }) => {
  await setup(page);
  await openOn(page, 1.6);
  await page.getByTestId('ease-preset-spring').click();
  await page.getByTestId('ease-spring-wobbly').click();
  await expect(page.getByTestId('ease-spring-note')).toBeVisible();
  await expect(page.getByTestId('ease-spring-note')).toContainText('Still moving at the next key');
  await page.getByTestId('ease-spring-stiffness').fill('1000');
  await page.getByTestId('ease-spring-stiffness').press('Enter');
  await page.getByTestId('ease-spring-damping').fill('63');
  await page.getByTestId('ease-spring-damping').press('Enter');
  await expect(page.getByTestId('ease-spring-note')).toHaveCount(0); // stiff and critically damped: settles in time
});

test('a locked track shows the spring read-only', async ({ page }) => {
  await setup(page, { locked: true });
  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    const bouncy = { kind: 'spring' as const, spring: { stiffness: 180, damping: 12, mass: 1 } };
    s.apply((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id !== 'v2' ? t : { ...t, clips: t.clips.map((c) => ({
      ...c, keys: { opacity: c.keys!.opacity!.map((k, i) => (i === 0 ? { ...k, ease: bouncy } : k)), scale: c.keys!.scale!.map((k, i) => (i === 0 ? { ...k, ease: bouncy } : k)) },
    })) })) }));
  });
  await openOn(page, 0.4);
  await expect(page.getByTestId('ease-spring-bouncy')).toBeDisabled();
  await expect(page.getByTestId('ease-spring-stiffness')).toBeDisabled();
  await expect(page.getByTestId('ease-preset-spring')).toHaveAttribute('aria-pressed', 'true');
});
