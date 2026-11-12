// Plan 5 Task 10: the read-only motion path of the selected clip: a polyline through its position keys (under the handles)
// and one clickable dot per visible key. Built on the pip project: 'pip' (lime 200×200 image, 0..2 s on layer v2).
import { test, expect } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import { newOverlayClip } from '../../src/core/overlays';
import { trackErrors } from './helpers';
import { canvasBox, setupPip, toPage, undoDepth } from './pip-helpers';
import type { Pt } from './pip-helpers';

test.setTimeout(90_000);

const C = { x: 960, y: 540 };
/** Three position keys (local 0 / 0.8 / 1.6 s, = timeline times on the pip clip) as offsets from the canvas centre. */
const KEYS = [{ t: 0, x: -400, y: -200 }, { t: 0.8, x: 0, y: 200 }, { t: 1.6, x: 400, y: -200 }];
const path = (page: Page) => page.getByTestId('motion-path');
const dots = (page: Page) => page.getByTestId('motion-key');
const setTime = (page: Page, t: number) => page.evaluate((t) => window.__clipforge!.getState().setPlayhead(t), t);
const playhead = (page: Page) => page.evaluate(() => window.__clipforge!.getState().playhead);
const projectJson = (page: Page) => page.evaluate(() => JSON.stringify(window.__clipforge!.getState().history.present));
const pipKeys = (page: Page) =>
  page.evaluate(() => window.__clipforge!.getState().history.present.tracks.flatMap((t) => t.clips).find((c) => c.id === 'pip')!.keys?.position ?? []);

/** Puts position keys on the pip clip (v2) and selects it; `track` patches its layer (locked / hidden). */
async function keyPip(page: Page, keys: typeof KEYS, track: { locked?: boolean; hidden?: boolean } = {}, extra: object = {}): Promise<void> {
  await page.evaluate(({ keys, track, extra }) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) =>
        t.id === 'v2'
          ? { ...t, ...track, clips: t.clips.map((c) => ({ ...c, keys: { ...extra, ...(keys.length ? { position: keys.map((k) => ({ ...k, ease: { kind: 'linear' as const } })) } : {}) } })) }
          : t,
      ),
    }));
    s.select(['pip']);
    s.setPlayhead(1);
  }, { keys, track, extra });
}

/** The centre of a dot in page px. */
async function centre(loc: Locator): Promise<Pt> {
  const b = (await loc.boundingBox())!;
  return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
}

/** Every polyline point of the path, in page px. */
function pathPoints(page: Page): Promise<Pt[][]> {
  return page.evaluate(() => {
    const svg = document.querySelector('[data-testid="motion-path"]')!;
    const r = svg.getBoundingClientRect();
    return [...svg.querySelectorAll('[data-testid="motion-path-run"]')].map((pl) =>
      (pl.getAttribute('points') ?? '').split(' ').map((s) => {
        const [x, y] = s.split(',').map(Number);
        return { x: x + r.left, y: y + r.top };
      }),
    );
  });
}

const near = (a: Pt, b: Pt, tol = 1): boolean => Math.abs(a.x - b.x) <= tol && Math.abs(a.y - b.y) <= tol;

test('a selected clip with three position keys shows the path through three key dots at the right places', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await expect(path(page)).toHaveCount(0);
  await expect(dots(page)).toHaveCount(0);
  const depth = await undoDepth(page);
  await keyPip(page, KEYS);
  await expect(path(page)).toHaveCount(1);
  await expect(dots(page)).toHaveCount(3);
  const b = await canvasBox(page);
  const [run] = await pathPoints(page);
  expect(run).toHaveLength(49); // 1.6 s at 30 fps, one point per frame including both ends
  for (const [i, k] of KEYS.entries()) {
    const want = toPage(b, { x: C.x + k.x, y: C.y + k.y });
    expect(near(await centre(dots(page).nth(i)), want), `dot ${i}`).toBe(true);
    expect(run.some((p) => near(p, want)), `path passes through key ${i}`).toBe(true);
  }
  expect(near(run[0], toPage(b, { x: C.x - 400, y: C.y - 200 }))).toBe(true);
  expect(near(run[48], toPage(b, { x: C.x + 400, y: C.y - 200 }))).toBe(true);
  // Labelled for assistive tech, time of the key in the name.
  await expect(dots(page).nth(1)).toHaveAttribute('aria-label', 'Position keyframe at 0.80 s');
  // The path is stacked under the handles, the dots above them.
  const order = await page.evaluate(() => {
    const all = [...document.querySelectorAll('.preview-stage > svg')].map((e) => e.getAttribute('class')!.split(' ')[0]);
    return all;
  });
  expect(order).toEqual(['motion-path-layer', 'transform-overlay', 'motion-keys-layer']);
  expect(await undoDepth(page)).toBe(depth + 1); // only the injected keys; showing the path writes nothing
  expect(errors).toEqual([]);
});

test('clicking a dot moves the playhead to that key without touching history; the dot under the playhead lets presses through', async ({ page }) => {
  const errors = trackErrors(page);
  await setupPip(page);
  await keyPip(page, KEYS);
  const depth = await undoDepth(page);
  const json = await projectJson(page);
  await dots(page).nth(2).click();
  await expect.poll(() => playhead(page)).toBeCloseTo(1.6, 6);
  await dots(page).nth(0).click();
  await expect.poll(() => playhead(page)).toBeCloseTo(0, 6);
  expect(await undoDepth(page)).toBe(depth);
  expect(await projectJson(page)).toBe(json);
  // Keyboard: focus a dot, Enter seeks.
  await setTime(page, 1.9);
  await dots(page).nth(1).focus();
  await page.keyboard.press('Enter');
  await expect.poll(() => playhead(page)).toBeCloseTo(0.8, 6);
  await expect(dots(page).nth(1)).toHaveAttribute('data-current', 'true');
  await expect(dots(page).nth(0)).not.toHaveAttribute('data-current', 'true');
  // On a key the dot sits at the clip centre: a drag from there still moves the clip (ONE step, keyed).
  const b = await canvasBox(page);
  const from = toPage(b, { x: C.x, y: C.y + 200 });
  const to = toPage(b, { x: C.x + 60, y: C.y + 200 });
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => undoDepth(page)).toBe(depth + 1);
  const keys = await pipKeys(page);
  expect(keys).toHaveLength(3);
  expect(keys[1].x).toBeGreaterThan(55);
  expect(keys[1].x).toBeLessThan(65);
  // The path follows the edit: the middle dot moved with the key.
  await expect.poll(async () => (await centre(dots(page).nth(1))).x).toBeCloseTo(to.x, 0);
  expect(errors).toEqual([]);
});

test('a drag that starts on the path line, away from the dots, still drags the clip', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, KEYS);
  await setTime(page, 0.4); // between keys: the clip sits halfway along the first segment
  const depth = await undoDepth(page);
  const [run] = await pathPoints(page);
  const onLine = run[12]; // frame 12 = 0.4 s: the clip centre, on the line, far from every dot
  const to: Pt = { x: onLine.x + 40, y: onLine.y };
  await page.mouse.move(onLine.x, onLine.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
  await expect.poll(() => undoDepth(page)).toBe(depth + 1);
  expect((await pipKeys(page)).length).toBe(4); // a key at 0.4 s
});

test('no path without position keys, with another clip selected, or with several clips selected', async ({ page }) => {
  await setupPip(page);
  // Scale keys only: no path.
  await keyPip(page, [], {}, { scale: [{ t: 0, v: 1, ease: { kind: 'linear' } }, { t: 1, v: 2, ease: { kind: 'linear' } }] });
  await expect(page.getByTestId('transform-overlay')).toBeVisible();
  await expect(path(page)).toHaveCount(0);
  await expect(dots(page)).toHaveCount(0);
  // Position keys but not selected (nothing, another clip, two clips).
  await keyPip(page, KEYS);
  await expect(dots(page)).toHaveCount(3);
  for (const ids of [[], ['bg'], ['pip', 'bg']]) {
    await page.evaluate((ids) => window.__clipforge!.getState().select(ids), ids);
    await expect(path(page)).toHaveCount(0);
    await expect(dots(page)).toHaveCount(0);
  }
  await page.evaluate(() => window.__clipforge!.getState().select(['pip']));
  await expect(dots(page)).toHaveCount(3);
});

test('a single position key shows its dot and no line', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, [KEYS[1]]);
  await expect(dots(page)).toHaveCount(1);
  await expect(path(page)).toHaveCount(0);
  const b = await canvasBox(page);
  expect(near(await centre(dots(page)), toPage(b, { x: C.x, y: C.y + 200 }))).toBe(true);
});

test('a hold segment draws a gap, not a line', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, KEYS);
  await page.evaluate(() => {
    const s = window.__clipforge!.getState();
    s.apply((p) => ({
      ...p,
      tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === 'pip' ? { ...c, keys: { position: c.keys!.position!.map((k, i) => (i === 0 ? { ...k, ease: { kind: 'hold' as const } } : k)) } } : c)) })),
    }));
  });
  await expect(path(page)).toHaveAttribute('data-runs', '2');
  const b = await canvasBox(page);
  const [held, rest] = await pathPoints(page);
  expect(held.every((p) => near(p, toPage(b, { x: C.x - 400, y: C.y - 200 })))).toBe(true);
  expect(near(rest[0], toPage(b, { x: C.x, y: C.y + 200 }))).toBe(true);
  await expect(dots(page)).toHaveCount(3);
});

test('the path shows while the playhead is off the clip, and a dot brings the playhead onto it', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, KEYS);
  await setTime(page, 4);
  await expect(path(page)).toHaveCount(1);
  await expect(page.getByTestId('transform-overlay')).toHaveCount(0); // no handles: the clip is not under the playhead
  await dots(page).nth(1).click();
  await expect.poll(() => playhead(page)).toBeCloseTo(0.8, 6);
  await expect(page.getByTestId('transform-overlay')).toBeVisible();
});

test('hidden layer: no path (like the handles); locked layer: path and dots stay, read-only, no handles', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, KEYS, { hidden: true });
  await expect(path(page)).toHaveCount(0);
  await expect(dots(page)).toHaveCount(0);
  await keyPip(page, KEYS, { hidden: false, locked: true });
  await expect(path(page)).toHaveCount(1);
  await expect(dots(page)).toHaveCount(3);
  await expect(page.getByTestId('transform-overlay')).toHaveCount(0);
  const depth = await undoDepth(page);
  const json = await projectJson(page);
  await dots(page).nth(2).click();
  await expect.poll(() => playhead(page)).toBeCloseTo(1.6, 6);
  expect(await undoDepth(page)).toBe(depth);
  expect(await projectJson(page)).toBe(json);
  // The path layer never takes the pointer except on a dot: a press elsewhere on the canvas is not captured by it.
  const b = await canvasBox(page);
  const free = toPage(b, { x: C.x - 700, y: C.y + 400 }); // away from every dot and the line
  const hit = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('.motion-path-layer, .motion-keys-layer') ?? null, free);
  expect(hit).toBeNull();
});

test('an overlay clip with position keys gets a path; an adjustment layer never does', async ({ page }) => {
  await setupPip(page);
  const ov = newOverlayClip('sticker', 0, 2, { width: 1920, height: 1080 });
  const keys = { position: [{ t: 0, x: -300, y: 0, ease: { kind: 'linear' } }, { t: 1, x: 300, y: 100, ease: { kind: 'linear' } }] };
  await page.evaluate(({ ov, keys }) => {
    const s = window.__clipforge!.getState();
    s.apply((p) => {
      const adj = { ...p.tracks[1].clips[0], id: 'adj', kind: 'adjustment' as const, mediaId: '', keys };
      const track = (id: string, clips: unknown[]) => ({ ...p.tracks[1], id, clips }) as typeof p.tracks[number];
      return { ...p, tracks: [p.tracks[0], p.tracks[1], track('v3', [{ ...ov, keys }]), track('v4', [adj]), p.tracks[2]] };
    });
    s.select([ov.id]);
    s.setPlayhead(0.5);
  }, { ov, keys });
  await expect(path(page)).toHaveCount(1);
  await expect(dots(page)).toHaveCount(2);
  await page.evaluate(() => window.__clipforge!.getState().select(['adj']));
  await expect(path(page)).toHaveCount(0);
  await expect(dots(page)).toHaveCount(0);
});

test('the path follows a format switch (reframe): dots and polyline stay on the key positions', async ({ page }) => {
  await setupPip(page);
  await keyPip(page, KEYS);
  await expect(dots(page)).toHaveCount(3);
  await page.getByTestId('format-select').selectOption('vertical');
  await expect(page.getByTestId('preview-canvas')).toHaveAttribute('height', '960');
  await expect.poll(async () => (await page.evaluate(() => window.__clipforge!.getState().history.present.format.width))).toBe(1080);
  const { fmt, keys } = await page.evaluate(() => {
    const p = window.__clipforge!.getState().history.present;
    return { fmt: p.format, keys: p.tracks.flatMap((t) => t.clips).find((c) => c.id === 'pip')!.keys!.position! };
  });
  // The keys were rescaled with the format (x·w'/w, y·h'/h).
  expect(keys[0].x).toBeCloseTo((-400 * 1080) / 1920, 6);
  expect(keys[0].y).toBeCloseTo((-200 * 1920) / 1080, 6);
  const b = await canvasBox(page);
  const [run] = await pathPoints(page);
  for (const [i, k] of keys.entries()) {
    const want = toPage(b, { x: fmt.width / 2 + k.x, y: fmt.height / 2 + k.y });
    expect(near(await centre(dots(page).nth(i)), want), `dot ${i} after reframe`).toBe(true);
    expect(run.some((p) => near(p, want)), `path through key ${i} after reframe`).toBe(true);
  }
  // Back to 16:9: the original positions return.
  await page.getByTestId('format-select').selectOption('youtube');
  await expect(page.getByTestId('preview-canvas')).toHaveAttribute('height', '540');
  const b2 = await canvasBox(page);
  for (const [i, k] of KEYS.entries()) {
    expect(near(await centre(dots(page).nth(i)), toPage(b2, { x: C.x + k.x, y: C.y + k.y })), `dot ${i} round trip`).toBe(true);
  }
});
