// The .cube LUT effect (Plan 4 Task 6) through the real compositor, checked against the CPU reference lutPixel.
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures, ffmpegFrame } from './fixtures';
import { clipOf, expectNear, openHarness, project, px, render } from './harness-helpers';
import { edgeImage, gradientImage, overBackdrops, straight } from './colour-helpers';
import type { Rgb } from './colour-helpers';
import { IDENTITY, INVERT, SWAP_GAMMA, cubeText, expectedLut, lutFx, parseCube } from './lut-helpers';
import type { MediaRef, Project, VideoEffect } from '../../src/core/model';

ensureFixtures();
const FORMAT = { width: 64, height: 64, fps: 30 };

function renderEffects(page: Page, p: Project, times: number[]) {
  return page.evaluate(({ p, times }) => window.cf.renderEffects(p, times), { p, times });
}
const importLut = (page: Page, text: string, name: string): Promise<MediaRef> =>
  page.evaluate(({ text, name }) => window.cf.importLutText(text, name), { text, name });
const withLuts = (p: Project, luts: MediaRef[]): Project => ({ ...p, media: { ...p.media, ...Object.fromEntries(luts.map((m) => [m.id, m])) } });

const SETS: { name: string; text: string; intensity: number }[] = [
  { name: 'identity 17', text: cubeText(17, IDENTITY), intensity: 1 },
  { name: 'invert 2', text: cubeText(2, INVERT), intensity: 1 },
  { name: 'swap+gamma 17', text: cubeText(17, SWAP_GAMMA, ['TITLE "Swap"']), intensity: 1 },
  { name: 'swap+gamma 17 at 0.5', text: cubeText(17, SWAP_GAMMA), intensity: 0.5 },
  { name: 'swap+gamma 9, domain', text: cubeText(9, SWAP_GAMMA, ['DOMAIN_MIN -0.25 0 0.1', 'DOMAIN_MAX 1.25 2 0.9']), intensity: 1 },
];

test('drift guard over the gradient: identity ≤1/255, every LUT ≤3/255 of lutPixel on every pixel, one pass', async ({ page }) => {
  await openHarness(page);
  const m = await gradientImage(page);
  const format = { width: 256, height: 48, fps: 30 };
  const luts = await Promise.all(SETS.map((s, i) => importLut(page, s.text, `set-${i}.cube`)));
  expect(luts[2].name).toBe('Swap');
  expect(luts[0]).toMatchObject({ kind: 'lut', name: 'set-0.cube' });
  const clips = SETS.map((s, i) => clipOf(m, { start: i, out: 1, effects: [lutFx(luts[i].id, s.intensity)] }));
  const r = await renderEffects(page, withLuts(project(format, [m], clips), luts), SETS.map((_, i) => i + 0.5));
  expect(r.error).toBeNull();
  expect(r.lutUnavailable).toEqual([]);
  expect(r.passes).toEqual(SETS.map((_, i) => i + 1));
  const [plain] = await render(page, project(format, [m], [clipOf(m, { out: 1 })]), [0]);
  let worst = 0;
  for (const [i, s] of SETS.entries()) {
    const lut = parseCube(s.text);
    let setWorst = 0;
    for (let y = 0; y < 48; y++) {
      for (let x = 0; x < 256; x++) {
        const want = expectedLut(px(plain, x, y), lut, s.intensity);
        const got = px(r.frames[i], x, y);
        for (let k = 0; k < 3; k++) setWorst = Math.max(setWorst, Math.abs(got[k] - want[k]));
      }
    }
    console.log(`LUT ${s.name}: max |GL − lutPixel| = ${setWorst.toFixed(3)} / 255`);
    expect(setWorst, `GL vs lutPixel for ${s.name}`).toBeLessThanOrEqual(i === 0 ? 1 : 3);
    worst = Math.max(worst, setWorst);
  }
  // The identity LUT also leaves the picture itself unchanged (within 1/255 of no effect).
  for (let x = 0; x < 256; x++) for (const y of [8, 24, 36, 44]) expectNear(px(r.frames[0], x, y), px(plain, x, y), 1, `identity at ${x},${y}`);
  console.log(`LUT drift guard: max |GL − lutPixel| over ${SETS.length} LUTs = ${worst.toFixed(3)} / 255`);
});

test('a 50 %- and a 15 %-alpha edge keep their colour and alpha under a LUT: no premultiplied halo', async ({ page }) => {
  await openHarness(page);
  const C: Rgb = [200, 120, 60];
  const edge = await edgeImage(page, C);
  const white = await page.evaluate(() => window.cf.putImageMedia(64, 64, [255, 255, 255]));
  const text = cubeText(17, SWAP_GAMMA);
  const lutM = await importLut(page, text, 'edge.cube');
  const lut = parseCube(text);
  const effects: VideoEffect[] = [lutFx(lutM.id)];
  const plain = overBackdrops(edge, white, [], FORMAT);
  const fxd = overBackdrops(edge, white, effects, FORMAT).map((p) => withLuts(p, [lutM]));
  const [plainB] = await render(page, plain[0], [0]);
  const [plainW] = await render(page, plain[1], [0]);
  const fxB = (await renderEffects(page, fxd[0], [0])).frames[0];
  const fxW = (await renderEffects(page, fxd[1], [0])).frames[0];
  for (const y of [4, 32, 60]) {
    expectNear(px(fxB, 16, y), expectedLut(px(plainB, 16, y), lut), 3, `opaque interior at y=${y}`);
    for (const [x, alpha] of [[33, 0.5], [36, 0.5], [39, 0.5], [40, 0.15], [43, 0.15]] as const) {
      const before = straight(plainB, plainW, x, y);
      const after = straight(fxB, fxW, x, y);
      expect(Math.abs(before.a - alpha), `fixture alpha at ${x}`).toBeLessThan(0.03);
      expect(Math.abs(after.a - before.a), `alpha at ${x},${y}`).toBeLessThanOrEqual(1.5 / 255);
      // Same tolerance as the colour drift guard: RGBA8 premultiplied storage, 1.5/alpha in straight colour.
      expectNear(after.rgb, expectedLut(before.rgb, lut), 1.5 / alpha, `edge colour at ${x},${y} (alpha ${alpha})`);
    }
    expectNear(px(fxW, 56, y), [255, 255, 255], 0, `transparent at y=${y}`);
  }
});

test('a missing or malformed LUT file: the effect is skipped with ONE notice each, the frame still renders', async ({ page }) => {
  await openHarness(page);
  const m = await page.evaluate(() => window.cf.putImageMedia(64, 64, [200, 40, 10], { right: [10, 120, 250] }));
  const gone = await importLut(page, cubeText(2, INVERT), 'gone.cube');
  await page.evaluate((id) => window.cf.removeMedia(id), gone.id);
  const bad: MediaRef = { id: 'bad-lut', name: 'Bad.cube', kind: 'lut', duration: 0, hasAudio: false };
  await page.evaluate(() => window.cf.putMedia('bad-lut', new Blob(['LUT_1D_SIZE 2\n0 0 0\n1 1 1'])));
  const p = withLuts(project(FORMAT, [m], [clipOf(m, { out: 1, effects: [lutFx(gone.id), lutFx(bad.id)] })]), [gone, bad]);
  const r = await renderEffects(page, p, [0, 0.3, 0.6]);
  expect(r.error).toBeNull();
  expect(r.passes).toEqual([0, 0, 0]);
  expect(r.lutUnavailable).toEqual([[gone.id, 'gone.cube'], ['bad-lut', 'Bad.cube']]);
  expect(r.unavailableTypes).not.toContain('lut');
  const [plain] = await render(page, project(FORMAT, [m], [clipOf(m, { out: 1 })]), [0]);
  for (const f of r.frames) expect(f.data).toEqual(plain.data);
});

test('a malformed .cube import is refused in plain English and stores nothing', async ({ page }) => {
  await openHarness(page);
  const before = await page.evaluate(() => window.cf.listMediaIds());
  const cases: [string, string, string][] = [
    ['one.cube', 'LUT_1D_SIZE 4\n0 0 0', 'This is a 1D LUT. ClipForge only supports 3D LUTs (.cube files with a LUT_3D_SIZE line).'],
    ['big.cube', 'LUT_3D_SIZE 128\n0 0 0', 'This LUT has 128 points per side. ClipForge supports 3D LUTs with 2 to 65 points per side.'],
    ['nan.cube', cubeText(2, INVERT).replace('1.000000 1.000000 1.000000', 'nan 1 1'), 'Line 2 of this .cube file is not three numbers: "nan 1 1".'],
  ];
  for (const [name, text, message] of cases) {
    const err = await page.evaluate(({ text, name }) => window.cf.importLutText(text, name).then(() => null, (e: Error) => `${e.name}: ${e.message}`), { text, name });
    expect(err).toBe(`ImportError: Could not import ${name}: ${message}`);
  }
  expect(await page.evaluate(() => window.cf.listMediaIds())).toEqual(before);
});

test('an exported frame carries the grade (ffmpeg frame grab)', async ({ page }) => {
  test.setTimeout(90_000);
  await openHarness(page);
  const C: Rgb = [40, 130, 200];
  const m = await page.evaluate((C) => window.cf.putImageMedia(64, 64, C), C);
  const lutM = await importLut(page, cubeText(2, INVERT), 'export.cube');
  const p = withLuts(project(FORMAT, [m], [clipOf(m, { out: 1, effects: [lutFx(lutM.id)] })]), [lutM]);
  const b64 = await page.evaluate((p) => window.cf.exportBase64(p), p);
  const file = test.info().outputPath('lut.mp4');
  writeFileSync(file, Buffer.from(b64, 'base64'));
  // Frame 0 too: the exporter awaits the LUT load, so even the first frame is never encoded ungraded.
  for (const index of [0, 5]) {
    const frame = ffmpegFrame(file, index);
    const at = (frame.width * Math.floor(frame.height / 2) + Math.floor(frame.width / 2)) * 3;
    // H.264 + 4:2:0 on a flat colour: a few levels of drift at most.
    expectNear([...frame.rgb.subarray(at, at + 3)], C.map((v) => 255 - v), 8, `exported frame ${index} centre pixel`);
  }
});
