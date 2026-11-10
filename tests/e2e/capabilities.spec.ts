// The capability banner names exactly what the browser lacks and import is disabled when it cannot work.
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import { ensureFixtures } from './fixtures';

test('without WebCodecs audio decoding the banner names it and import is disabled', async ({ page }) => {
  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).AudioDecoder;
  });
  await page.goto('/');
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('banner-no-webcodecs')).toHaveText(
    'Your browser is missing: WebCodecs audio decoding. Use a recent desktop Chrome.',
  );
  await expect(page.getByTestId('file-input')).toBeDisabled();
});

test('without FileSystemFileHandle.createWritable the banner names OPFS file writing and import is disabled', async ({ page }) => {
  await page.addInitScript(() => {
    delete (FileSystemFileHandle.prototype as unknown as Record<string, unknown>).createWritable;
  });
  await page.goto('/');
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('banner-no-webcodecs')).toHaveText(
    'Your browser is missing: OPFS file writing. Use a recent desktop Chrome.',
  );
  await expect(page.getByTestId('file-input')).toBeDisabled();
});

test('several missing capabilities are listed together', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Record<string, unknown>;
    delete w.AudioDecoder;
    delete (FileSystemFileHandle.prototype as unknown as Record<string, unknown>).createWritable;
  });
  await page.goto('/');
  await expect(page.getByTestId('banner-no-webcodecs')).toHaveText(
    'Your browser is missing: WebCodecs audio decoding, OPFS file writing. Use a recent desktop Chrome.',
  );
});

test('a fully capable browser shows no banner', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await expect(page.getByTestId('banner-no-webcodecs')).toHaveCount(0);
  await expect(page.getByTestId('file-input')).toBeEnabled();
});

test('a lazily loaded chunk that is gone after a redeploy asks for a reload instead of blaming WebGL2', async ({ page }) => {
  // What a host returns for a missing hashed chunk when it falls back to the app shell: HTML, not JavaScript.
  await page.route('**/src/render/compositor.ts*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>ClipForge</title>' }),
  );
  await page.goto('/');
  await expect(page.getByTestId('preview-unavailable')).toHaveText('ClipForge was updated — reload the page.');
});

test('a vanished decoder chunk stops the preview with the reload message instead of a blank canvas', async ({ page }) => {
  await page.route('**/src/media/decode.ts*', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>ClipForge</title>' }),
  );
  await page.goto('/');
  await expect(page.getByTestId('app')).toHaveAttribute('data-session', 'ready');
  await page.getByTestId('file-input').setInputFiles(join(ensureFixtures(), 'with-audio.mp4'));
  await page.getByTestId('btn-add-to-timeline').click();
  await expect(page.getByTestId('preview-unavailable')).toHaveText('ClipForge was updated — reload the page.');
});
