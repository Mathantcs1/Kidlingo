import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { addToTimeline, importFiles, open, setPlayhead, trackErrors, withAudio } from './helpers';
import { LEGACY_UNAVAILABLE, plainReason } from '../../src/render/glErrors';
import { STUB_LOG, setStub, stubGl } from './gl-stub';

test.setTimeout(90_000);

const HINT = "Check chrome://gpu: WebGL2 should say 'Hardware accelerated'";

/** Mean RGB and minimum alpha of the preview canvas, downsampled through a 2D canvas. */
function previewPixels(page: Page): Promise<{ mean: number; minAlpha: number }> {
  return page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    const o = document.createElement('canvas');
    o.width = 64;
    o.height = 36;
    const ctx = o.getContext('2d')!;
    ctx.drawImage(c, 0, 0, o.width, o.height);
    const d = ctx.getImageData(0, 0, o.width, o.height).data;
    let sum = 0;
    let minAlpha = 255;
    for (let i = 0; i < d.length; i += 4) {
      sum += d[i] + d[i + 1] + d[i + 2];
      minAlpha = Math.min(minAlpha, d[i + 3]);
    }
    return { mean: sum / ((d.length / 4) * 3), minAlpha };
  });
}

/** Collects console.error texts. */
function consoleErrors(page: Page): string[] {
  const out: string[] = [];
  page.on('console', (m) => {
    if (m.type() === 'error') out.push(m.text());
  });
  return out;
}

test('without WebGL2 the preview says why, editing works, and Try again brings it up', async ({ page, context }) => {
  const errors = trackErrors(page);
  const logged = consoleErrors(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await stubGl(page, { noWebGl2: true });
  await open(page);
  const panel = page.getByTestId('preview-unavailable');
  await expect(panel).toContainText(`The preview could not start: ${LEGACY_UNAVAILABLE}`);
  await expect(panel).toContainText(HINT);
  await expect(page.getByTestId('preview-canvas')).toBeHidden();
  const details = page.getByTestId('preview-details');
  await expect(details).not.toHaveAttribute('open');
  await expect(details).toContainText('Reason: context-null');
  await expect(details).toContainText('webgl2 {preserveDrawingBuffer:true}: null');
  await expect(details).toContainText('User agent: ');
  await expect(details).toContainText('WebGL renderer: ');
  expect(logged.some((t) => t.startsWith('clipforge: preview could not start'))).toBe(true);

  await page.getByTestId('preview-copy-details').click();
  await expect(page.getByTestId('preview-copy-status')).toHaveText('Copied');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('Reason: context-null');

  // The rest of the editor keeps working.
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await setPlayhead(page, 1);
  await page.getByTestId('btn-split').click();
  await expect(page.getByTestId('timeline-clip')).toHaveCount(2);

  await setStub(page, { noWebGl2: false });
  await page.getByTestId('preview-retry').click();
  await expect(panel).toBeHidden();
  await expect(page.getByTestId('preview-canvas')).toBeVisible();
  await expect.poll(async () => (await previewPixels(page)).mean).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('a shader compile failure is named, with the GL info log in the details', async ({ page }) => {
  const errors = trackErrors(page);
  await stubGl(page, { shaderFail: true });
  await open(page);
  const panel = page.getByTestId('preview-unavailable');
  await expect(panel).toContainText(`The preview could not start: ${plainReason('shader')}.`);
  await expect(panel).not.toContainText(LEGACY_UNAVAILABLE);
  const details = page.getByTestId('preview-details');
  await expect(details).toContainText('Reason: shader');
  await expect(details).toContainText(`GL info log: ${STUB_LOG}`);
  await expect(details).toContainText(': ok');

  await setStub(page, { shaderFail: false });
  await page.getByTestId('preview-retry').click();
  await expect(panel).toBeHidden();
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await expect.poll(async () => (await previewPixels(page)).mean).toBeGreaterThan(20);
  expect(errors).toEqual([]);
});

test('a driver that refuses alpha:false gets a fallback context that still renders opaque', async ({ page }) => {
  const errors = trackErrors(page);
  await stubGl(page, { noAlphaFalse: true });
  await open(page);
  await importFiles(page, [withAudio], 1);
  await addToTimeline(page, 'with-audio.mp4', 1);
  await expect(page.getByTestId('preview-unavailable')).toHaveCount(0);
  await expect.poll(async () => (await previewPixels(page)).mean).toBeGreaterThan(20);
  expect((await previewPixels(page)).minAlpha).toBe(255);
  const alpha = await page.evaluate(() => {
    const c = document.querySelector<HTMLCanvasElement>('[data-testid="preview-canvas"]')!;
    return (c.getContext('webgl2') as WebGL2RenderingContext).getContextAttributes()?.alpha;
  });
  expect(alpha).toBe(true);
  expect(errors).toEqual([]);
});
