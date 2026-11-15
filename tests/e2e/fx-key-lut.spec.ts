// Plan 4 Task 7: chroma key and .cube LUT grading (plus the LUT file store surviving a reload).
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { openHarness, clipOf, expectNear, project, render } from './harness-helpers';
import type { Rgb } from './harness-helpers';
import { SIZE, centre, flat, fx, oneClip, renderStack, toBytes, toUnit } from './fx-helpers';
import { newTrack } from '../../src/core/model';
import type { MediaRef, Project, VisualEffect } from '../../src/core/model';
import { chromaPixel, invertPixel, mixRgb } from '../../src/fx/reference';
import { defaultFxParams } from '../../src/fx/params';

test.setTimeout(180_000);
const TOL = 3;
const RED: Rgb = [220, 30, 30];
const GREEN_KEY = 0x00ff00;
const chroma = (over: Record<string, number> = {}): VisualEffect => fx('chroma', { key: GREEN_KEY, ...over });

/** `top` (with `stack`) over a flat `bottom` colour layer. */
async function keyed(page: Page, top: Rgb, stack: VisualEffect[], bottom: Rgb = RED, hideTop = false): Promise<Rgb> {
  const a = await flat(page, bottom);
  const b = await flat(page, top);
  const base: Project = project({ width: SIZE, height: SIZE, fps: 10 }, [a, b], []);
  const p: Project = {
    ...base,
    tracks: [
      { ...newTrack('video'), id: 'v1', clips: [clipOf(a, { out: 2 })] },
      { ...newTrack('video'), id: 'v2', hidden: hideTop, clips: [clipOf(b, { out: 2, fx: stack })] },
      { ...newTrack('audio'), id: 'a' },
    ],
  };
  return centre((await render(page, p, [0.5]))[0]);
}

test('chroma key: keys the green out to the layer below, keeps a skin tone, is soft in between', async ({ page }) => {
  await openHarness(page);
  expectNear(await keyed(page, [0, 255, 0], [chroma()]), RED, TOL, 'key colour removed');
  const skin: Rgb = [200, 150, 120];
  const want = chromaPixel(toUnit(skin), { ...defaultFxParams('chroma'), key: GREEN_KEY });
  expect(want.alpha).toBe(1);
  expectNear(await keyed(page, skin, [chroma()]), toBytes(want.rgb), TOL, 'skin kept');
  // A colour inside the soft band: partial alpha over the layer below.
  let mid: Rgb | null = null;
  for (let t = 0; t <= 1 && !mid; t += 0.02) {
    const c: Rgb = [Math.round(255 * t), Math.round(255 * (1 - t)), 0];
    const a = chromaPixel(toUnit(c), { ...defaultFxParams('chroma'), key: GREEN_KEY }).alpha;
    if (a > 0.3 && a < 0.7) mid = c;
  }
  expect(mid).not.toBeNull();
  const r = chromaPixel(toUnit(mid!), { ...defaultFxParams('chroma'), key: GREEN_KEY });
  expect(r.alpha).toBeGreaterThan(0);
  expect(r.alpha).toBeLessThan(1);
  expectNear(await keyed(page, mid!, [chroma()]), toBytes(mixRgb(toUnit(RED), r.rgb, r.alpha)), TOL, 'soft edge');
});

test('chroma key: tolerance 0 keeps everything but the exact key; spill pulls green out of kept pixels; a hidden layer is inert', async ({ page }) => {
  await openHarness(page);
  const tight = { tolerance: 0, softness: 0, spill: 0 };
  expectNear(await keyed(page, [10, 250, 10], [chroma(tight)]), [10, 250, 10], TOL, 'near-key kept at tolerance 0');
  expectNear(await keyed(page, [0, 255, 0], [chroma(tight)]), RED, TOL, 'exact key removed at tolerance 0');
  const spilled = await keyed(page, [60, 200, 60], [chroma({ tolerance: 0.15, softness: 0.05, spill: 1 })]);
  expect(spilled[1]).toBeLessThanOrEqual(200 - 20);
  const unspilled = await keyed(page, [60, 200, 60], [chroma({ tolerance: 0.15, softness: 0.05, spill: 0 })]);
  expectNear(unspilled, [60, 200, 60], TOL, 'spill 0');
  expectNear(await keyed(page, [60, 200, 60], [chroma()], RED, true), RED, TOL, 'hidden top layer');
});

const cube = (n: number, map: (c: Rgb) => Rgb): string => {
  const rows: string[] = [];
  for (let b = 0; b < n; b++) for (let g = 0; g < n; g++) for (let r = 0; r < n; r++) rows.push(map([r / (n - 1), g / (n - 1), b / (n - 1)]).join(' '));
  return `TITLE "test"\nLUT_3D_SIZE ${n}\n${rows.join('\n')}\n`;
};
const IDENTITY = cube(2, (c) => c);
const INVERT = cube(2, (c) => [1 - c[0], 1 - c[1], 1 - c[2]]);

async function putLut(page: Page, id: string, text: string): Promise<void> {
  await page.evaluate(({ id, text }) => window.cf.putLut(id, text), { id, text });
}
const withLut = (p: Project, id: string, size = 2): Project => ({ ...p, luts: { ...p.luts, [id]: { id, name: id, size } } });
const lutFx = (ref: string, intensity = 1): VisualEffect => fx('lut', { intensity }, { ref });

test('lut: an identity cube leaves the picture alone, an inverting cube inverts it, intensity blends', async ({ page }) => {
  await openHarness(page);
  await putLut(page, 'ident', IDENTITY);
  await putLut(page, 'inv', INVERT);
  for (const rgb of [[128, 128, 128], [204, 77, 26], [26, 153, 230]] as Rgb[]) {
    const m = await flat(page, rgb);
    const grade = async (id: string, k = 1): Promise<Rgb> => {
      const p = withLut(oneClip(m, [lutFx(id, k)]), id);
      return centre((await render(page, p, [0.5]))[0]);
    };
    expectNear(await grade('ident'), rgb, 1, `identity ${rgb}`);
    expectNear(await grade('inv'), toBytes(invertPixel(toUnit(rgb), 1)), 2, `invert ${rgb}`);
    expectNear(await grade('inv', 0.5), toBytes(invertPixel(toUnit(rgb), 0.5)), 2, `half ${rgb}`);
  }
});

test('lut: two clips sharing one LUT share one texture; a missing file renders ungraded without errors', async ({ page }) => {
  await openHarness(page);
  await putLut(page, 'inv', INVERT);
  const m = await flat(page, [90, 160, 220]);
  const mk = (id: string, ref: string): Project => {
    const base = withLut(oneClip(m, []), id);
    const clip = (n: string) => ({ ...clipOf(m, { out: 2, fx: [lutFx(ref)] }), id: n });
    return { ...base, tracks: [{ ...newTrack('video'), id: 'v1', clips: [clip('c1')] }, { ...newTrack('video'), id: 'v2', clips: [clip('c2')] }, { ...newTrack('audio'), id: 'a' }] };
  };
  const shared = await page.evaluate((p) => window.cf.renderStats(p, [0, 0.1, 0.2]), mk('inv', 'inv'));
  expect(shared.after.lutTextures).toBe(1);
  expect(shared.glError).toBe(0);

  const [missing] = await render(page, mk('ghost', 'ghost'), [0.5]);
  const [plain] = await render(page, oneClip(m, []), [0.5]);
  expectNear(centre(missing), centre(plain), 1, 'missing LUT leaves the clip ungraded');
  expect(missing.glError).toBe(0);
});

test('lut files persist across a reload and can be listed', async ({ page }) => {
  await openHarness(page);
  await putLut(page, 'keepme', IDENTITY);
  await page.reload();
  await page.waitForFunction(() => window.cf !== undefined);
  expect(await page.evaluate(() => window.cf.listLutIds())).toContain('keepme');
  const m: MediaRef = await flat(page, [1, 2, 3]);
  const [f] = await render(page, withLut(oneClip(m, [lutFx('keepme')]), 'keepme'), [0.5]);
  expectNear(centre(f), [1, 2, 3], 1, 'graded after reload');
  expect((await renderStack(page, m, [])).glError).toBe(0);
});
