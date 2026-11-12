// Plan 5 Task 11: history and persistence of keyframes in the real app. Ten keyframe gestures through the UI
// (stopwatches, typed values at the playhead, the key button, an ease preset, stopwatch off) are ten undo steps; undo
// and redo walk back and forth restoring each state exactly (project JSON) with the motion path following the keys;
// a reload restores the keys exactly and the path with them. Scale 0 (keyed and static) never shows a NaN in the UI.
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { open, trackErrors } from './helpers';
import { setupPip } from './pip-helpers';
import type { Project } from '../../src/core/model';

test.setTimeout(120_000);

const setTime = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
const json = (page: Page) => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));
const depth = (page: Page) => page.evaluate(() => window.__clipforge!.getState().history.past.length);

async function typeInto(page: Page, key: string, value: string): Promise<void> {
  await page.getByTestId(`inspector-${key}`).fill(value);
  await page.getByTestId(`inspector-${key}`).press('Enter');
}

/** The motion-path dot times the UI shows, and the visible position key times of the stored pip clip (end exclusive). */
async function pathMatchesKeys(page: Page): Promise<void> {
  const want = await page.evaluate(() => {
    const c = window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((x) => x.id === 'pip')!;
    return (c.keys?.position ?? []).filter((k) => k.t < c.out - 1e-9).map((k) => k.t);
  });
  await expect
    .poll(async () => (await page.getByTestId('motion-key').evaluateAll((els) => els.map((e) => Number(e.getAttribute('data-time'))))).join())
    .toBe(want.join());
}

/** The ten gestures; each must be exactly ONE undo step. */
const GESTURES: [string, (page: Page) => Promise<void>][] = [
  ['position stopwatch at 0.5 s', async (page) => { await setTime(page, 0.5); await page.getByTestId('kf-toggle-position').click(); }],
  ['typed X at 1.5 s', async (page) => { await setTime(page, 1.5); await typeInto(page, 'x', '300'); }],
  ['scale stopwatch at 1.5 s', async (page) => page.getByTestId('kf-toggle-scale').click()],
  ['typed scale at 0.5 s', async (page) => { await setTime(page, 0.5); await typeInto(page, 'scale', '50'); }],
  ['opacity key button at 0.5 s', async (page) => page.getByTestId('kf-key-opacity').click()],
  ['typed opacity at 1 s', async (page) => { await setTime(page, 1); await typeInto(page, 'opacity', '40'); }],
  ['rotation stopwatch at 1 s', async (page) => page.getByTestId('kf-toggle-rotation').click()],
  ['typed Y at 1 s (third position key)', async (page) => typeInto(page, 'y', '-150')],
  ['ease preset on the 0.5 s keys', async (page) => {
    await page.locator('[data-testid="keyframe-diamond"][data-time="0.5000"]').dblclick();
    await page.getByTestId('ease-preset-easeOut').click();
    await page.keyboard.press('Escape');
  }],
  ['rotation stopwatch off', async (page) => page.getByTestId('kf-toggle-rotation').click()],
];

test('ten keyframe gestures: ten undo steps; undo/redo restore every state exactly, the motion path follows; reload restores keys', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  const states = [await json(page)];
  const d0 = await depth(page);
  for (const [i, [what, run]] of GESTURES.entries()) {
    await run(page);
    await expect.poll(() => depth(page), { message: what }).toBe(d0 + i + 1);
    states.push(await json(page));
    expect(states[i + 1], `${what} changed the project`).not.toBe(states[i]);
  }
  const final = JSON.parse(states[10]) as Project;
  const pip = final.tracks.flatMap((t) => t.clips).find((c) => c.id === 'pip')!;
  expect(Object.keys(pip.keys!).sort()).toEqual(['opacity', 'position', 'scale']);
  expect(pip.keys!.position!.map((k) => k.t)).toEqual([0.5, 1, 1.5]);
  expect(pip.keys!.position![0].ease.kind).toBe('easeOut');
  await pathMatchesKeys(page);

  for (let i = 9; i >= 0; i--) {
    await page.getByTestId('btn-undo').click();
    expect(await json(page), `undo to state ${i}`).toBe(states[i]);
    await pathMatchesKeys(page);
  }
  for (let i = 1; i <= 10; i++) {
    await page.getByTestId('btn-redo').click();
    expect(await json(page), `redo to state ${i}`).toBe(states[i]);
    await pathMatchesKeys(page);
  }

  await page.evaluate(() => window.__clipforge!.flushAutosave());
  await page.reload();
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect.poll(() => json(page)).toBe(states[10]);
  await page.evaluate(() => window.__clipforge!.getState().select(['pip']));
  await pathMatchesKeys(page);
  await expect(page.getByTestId('motion-key')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('scale 0 keyed and static: fields, handles and the motion path show no NaN; nothing throws', async ({ page }) => {
  const errors = trackErrors(page);
  const consoleErrors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  await setupPip(page);
  const lin = { kind: 'linear' as const };
  const keyed = { scale: [{ t: 0, v: 1, ease: { kind: 'back' as const } }, { t: 1, v: 0, ease: lin }], position: [{ t: 0, x: -300, y: 0, ease: lin }, { t: 1.5, x: 300, y: 100, ease: lin }] };
  const noNaN = async (what: string): Promise<void> => {
    const html = await page.locator('body').innerHTML();
    expect(html.includes('NaN'), `${what}: NaN in the DOM`).toBe(false);
    const values = await page.locator('[data-testid^="inspector-"] input, input[data-testid^="inspector-"]').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(values.some((v) => v.includes('NaN')), `${what}: ${values}`).toBe(false);
  };
  for (const [what, patch] of [
    ['keyed scale reaching 0', { keys: keyed }],
    ['static scale 0 under keyed position', { transform: { x: 0, y: 0, scale: 0, rotation: 0, opacity: 1 }, keys: { position: keyed.position } }],
  ] as const) {
    await page.evaluate((patch) => {
      const s = window.__clipforge!.getState();
      s.apply((p) => ({ ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'pip' ? { ...c, ...patch } : c)) })) }));
      s.select(['pip']);
    }, patch);
    for (const t of [0, 0.5, 1, 1.2, 1.9]) {
      await setTime(page, t);
      await expect(page.getByTestId('motion-path')).toBeVisible();
      await noNaN(`${what} at ${t}`);
    }
  }
  await open(page); // a fresh load of the saved state renders too
  expect(errors).toEqual([]);
  expect(consoleErrors.filter((m) => /NaN|Infinity/.test(m))).toEqual([]);
});
