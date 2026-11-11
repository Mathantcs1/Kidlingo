// Effect failure policy and performance (Plan 4 Task 11): a shader that cannot compile costs one toast and the effect,
// never the preview or the export; a lost context still fails the export in plain English; hidden tracks cost nothing.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { clipEl, setPlayhead, trackErrors } from './helpers';
import { clipOf, openHarness, project } from './harness-helpers';
import { addEffect, setupImage } from './effects-ui-helpers';
import { pixelAt } from './pip-helpers';
import { SWAP_GAMMA, cubeText, lutFx } from './lut-helpers';
import { defaultParams } from '../../src/core/videoEffects';
import { effectUnavailableMessage } from '../../src/render/effects/unavailable';
import type { MediaRef, Project, VideoEffect, VideoEffectType } from '../../src/core/model';

test.setTimeout(180_000);

let n = 0;
const fx = (type: VideoEffectType, params: Record<string, number> = {}): VideoEffect =>
  ({ id: `ffx-${++n}`, type, enabled: true, params: { ...defaultParams(type), ...params } });

/** Records every toast element added to the page from now on (toasts auto-dismiss, so counting live ones misses some). */
const recordToasts = (page: Page): Promise<void> =>
  page.evaluate(() => {
    const log: string[] = [];
    (window as unknown as { toastLog: string[] }).toastLog = log;
    new MutationObserver((records) => {
      for (const r of records) {
        for (const node of r.addedNodes) {
          if (node instanceof HTMLElement && node.matches('[data-testid$="-toast"]')) log.push(node.textContent ?? '');
        }
      }
    }).observe(document.body, { childList: true, subtree: true });
  });
/** The inverted 0x3080C0 test image (setupImage), within 1/255. */
const INVERTED = [255 - 0x30, 255 - 0x80, 255 - 0xc0];
const isInverted = async (page: Page): Promise<boolean> =>
  (await pixelAt(page, 960, 540)).every((v, k) => Math.abs(v - INVERTED[k]) <= 1);
const toastLog = (page: Page): Promise<string[]> => page.evaluate(() => (window as unknown as { toastLog: string[] }).toastLog);

/** ffmpeg's per-frame MD5 of the decoded video stream of base64 MP4 data. */
function frameHashes(name: string, b64: string): string[] {
  const file = test.info().outputPath(name);
  writeFileSync(file, Buffer.from(b64, 'base64'));
  const out = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-map', '0:v', '-f', 'framemd5', '-']).toString();
  return out.split('\n').filter((l) => l && !l.startsWith('#')).map((l) => l.split(',').at(-1)!.trim());
}

test('a glow shader that cannot compile: one toast, the preview still draws, the export finishes with a notice', async ({ page }) => {
  const errors = trackErrors(page);
  const clipId = await setupImage(page);
  // A short clip keeps the 1080p export quick.
  await page.evaluate(() => window.__clipforge!.getState().apply((p) => ({
    ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => ({ ...c, out: c.in + 0.3 })) })),
  })));
  await clipEl(page, clipId).click();
  await page.evaluate(() => window.__clipforge!.breakVideoEffect('glow'));
  await recordToasts(page);
  await addEffect(page, 'invert');
  await expect.poll(() => isInverted(page)).toBe(true);
  await addEffect(page, 'glow');
  const message = effectUnavailableMessage('glow');
  await expect(page.getByTestId('error-toast').filter({ hasText: message })).toBeVisible();
  // More frames with the broken effect: no more toasts, and the picture is the invert-only picture.
  for (const t of [0.1, 0.2, 0]) await setPlayhead(page, t);
  await expect.poll(() => isInverted(page)).toBe(true);
  expect((await toastLog(page)).filter((m) => m.includes(message))).toHaveLength(1);

  await page.getByTestId('btn-export').click();
  await page.getByTestId('btn-export-start').click();
  await expect(page.getByTestId('export-download')).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId('export-notice')).toHaveText(
    'Exported without these effects (this device cannot run them): Glow.',
  );
  // The export compositor gets no second callback (failures are session-wide): still exactly one toast.
  expect((await toastLog(page)).filter((m) => m.includes(message))).toHaveLength(1);
  expect(errors).toEqual([]);
});

test('an export with a failed glow and a missing LUT equals the export without them, and lists both', async ({ page }) => {
  await openHarness(page);
  const m = await page.evaluate(() => window.cf.putImageMedia(160, 90, [200, 90, 40], { right: [40, 150, 210] }));
  const lut = await page.evaluate((text) => window.cf.importLutText(text, 'swap.cube'), cubeText(5, SWAP_GAMMA));
  const gone: MediaRef = { id: 'gone-lut', name: 'Gone.cube', kind: 'lut', duration: 0, hasAudio: false };
  const format = { width: 160, height: 90, fps: 30 };
  const withMedia = (p: Project): Project => ({ ...p, media: { ...p.media, [lut.id]: lut, [gone.id]: gone } });
  const plain = withMedia(project(format, [m], [clipOf(m, { id: 'c', out: 0.3, effects: [fx('colour', { contrast: 0.4 }), lutFx(lut.id)] })]));
  const broken = withMedia(project(format, [m], [clipOf(m, {
    id: 'c', out: 0.3, effects: [fx('colour', { contrast: 0.4 }), fx('glow'), lutFx(gone.id), lutFx(lut.id)],
  })]));
  await page.evaluate(() => window.cf.registerTestEffect('glow', 'broken'));
  const want = await page.evaluate((p) => window.cf.exportWithSkips(p, 160), plain);
  expect(want.skips).toBeNull();
  const got = await page.evaluate((p) => window.cf.exportWithSkips(p, 160), broken);
  expect(got.skips).toEqual({ effects: ['glow'], luts: ['Gone.cube'] });
  const hashes = frameHashes('broken.mp4', got.b64);
  expect(hashes).toHaveLength(9);
  expect(hashes).toEqual(frameHashes('plain.mp4', want.b64));
  // A second export: the session-wide failure is still reported (no onEffectUnavailable callback this time).
  expect((await page.evaluate((p) => window.cf.exportWithSkips(p, 160), broken)).skips).toEqual({ effects: ['glow'], luts: ['Gone.cube'] });
});

test('a context lost in the middle of an effect stack fails the export plainly and leaves no temp file', async ({ page }) => {
  await openHarness(page);
  const m = await page.evaluate(() => window.cf.putImageMedia(64, 36, [200, 90, 40]));
  const p = project({ width: 64, height: 36, fps: 30 }, [m], [clipOf(m, { out: 0.3, effects: [fx('colour'), fx('invert')] })]);
  const r = await page.evaluate((p) => window.cf.exportLosingContext(p, 'invert', 3, 64), p);
  expect(r.error).toBe('WebGL context lost');
  expect(r.calls).toBe(4);
  expect(await page.evaluate(() => window.cf.listExportTemp())).toEqual([]);
});

test('a hidden track with effects is neither drawn nor processed', async ({ page }) => {
  await openHarness(page);
  const m = await page.evaluate(() => window.cf.putImageMedia(64, 36, [200, 90, 40]));
  const shown = project({ width: 64, height: 36, fps: 30 }, [m], [clipOf(m, { out: 1, effects: [fx('colour'), fx('blur'), fx('glow')] })]);
  const visible = await page.evaluate(({ p }) => window.cf.renderEffects(p, [0, 0.5]), { p: shown });
  expect(visible.passes.at(-1)).toBeGreaterThan(0);
  const hidden = { ...shown, tracks: shown.tracks.map((t) => (t.kind === 'video' ? { ...t, hidden: true } : t)) };
  const r = await page.evaluate(({ p }) => window.cf.renderEffects(p, [0, 0.5]), { p: hidden });
  expect(r.error).toBeNull();
  expect(r.passes).toEqual([0, 0]);
  expect(r.memory.at(-1)).toEqual({ targets: 0, bytes: 0 });
  for (const f of r.frames) expect(new Set(f.data.filter((_, i) => i % 4 !== 3))).toEqual(new Set([0]));
});

// Ruling (Task 11): the plan's 6x was estimated before the shaders existed. On SwiftShader even a trivial 1080p pass
// costs about one no-effect frame (invert alone ~2x), the colour shader pays for its exposure pow() even when exposure
// is 0 (SwiftShader runs both sides of a uniform branch) and a trilinear 3D LUT fetch ~4 frames, so 4 effects measure
// 9.7-11.0x on interleaved medians (Task 11 report). The relative guard is 14x (~27% headroom for SwiftShader noise;
// a per-frame shader recompile measured 15.3x, so it still fails), plus exact structural guards (4 passes per frame,
// one working-size target pair) that catch extra passes and reallocation.
test('performance guard: a 1080p frame with 4 effects renders within 14x the no-effect frame time', async ({ page }) => {
  await openHarness(page);
  const m = await page.evaluate(() => window.cf.putImageMedia(1920, 1080, [200, 90, 40], { right: [40, 150, 210] }));
  const lut = await page.evaluate((text) => window.cf.importLutText(text, 'perf.cube'), cubeText(17, SWAP_GAMMA));
  const format = { width: 1920, height: 1080, fps: 30 };
  const stack = [fx('colour', { contrast: 0.2 }), fx('grain'), fx('vignette'), lutFx(lut.id)];
  const at = (effects: VideoEffect[]): Project => {
    const p = project(format, [m], [clipOf(m, { out: 2, effects })]);
    return { ...p, media: { ...p.media, [lut.id]: lut } };
  };
  const times = Array.from({ length: 15 }, (_, i) => i / 30);
  const [base, four] = await page.evaluate(({ a, b, times }) => window.cf.timeRenderPair(a, b, times), { a: at([]), b: at(stack), times });
  // Interleaved frames see the same load (both medians and minima are reported; medians vary less here).
  const ratio = four.median / base.median;
  const note = `1080p frame over ${times.length} interleaved frames: no effects min ${base.min.toFixed(1)} / median ` +
    `${base.median.toFixed(1)} ms, 4 effects min ${four.min.toFixed(1)} / median ${four.median.toFixed(1)} ms ` +
    `(x${ratio.toFixed(2)} on medians, x${(four.min / base.min).toFixed(2)} on minima); effect targets ` +
    `${four.memory.targets} = ${(four.memory.bytes / 2 ** 20).toFixed(1)} MiB`;
  console.log(note);
  test.info().annotations.push({ type: 'performance', description: note });
  expect(base.passes).toBe(0);
  // 2 warm-up frames + 15 timed frames, 4 passes each: nothing extra is drawn.
  expect(four.passes).toBe(4 * (2 + times.length));
  expect(four.memory).toEqual({ targets: 2, bytes: 2 * 1920 * 1080 * 4 });
  // A regression guard on SwiftShader (relative), not a promise about real GPUs.
  expect(ratio).toBeLessThanOrEqual(14);
});
