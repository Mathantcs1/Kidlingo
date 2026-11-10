import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import type { MediaRef } from '../../src/core/model';
import { ensureFixtures } from './fixtures';

const dir = ensureFixtures();
const withAudio = join(dir, 'with-audio.mp4');
const noAudio = join(dir, 'no-audio.mp4');

async function openHarness(page: Page): Promise<void> {
  await page.goto('/harness.html');
  await page.waitForFunction(() => window.cf !== undefined);
}

test('imports MP4s with and without audio into OPFS', async ({ page }) => {
  await openHarness(page);
  await page.setInputFiles('#harness-file', [withAudio, noAudio]);

  const a: MediaRef = await page.evaluate(() => window.cf.importInputFile(0));
  expect(a.kind).toBe('video');
  expect(a.name).toBe('with-audio.mp4');
  expect(Math.abs(a.duration - 3)).toBeLessThanOrEqual(0.15);
  expect(a.width).toBe(640);
  expect(a.height).toBe(360);
  expect(a.hasAudio).toBe(true);
  expect(Math.abs((a.fps ?? 0) - 30)).toBeLessThanOrEqual(0.5);

  const b: MediaRef = await page.evaluate(() => window.cf.importInputFile(1));
  expect(b.kind).toBe('video');
  expect(Math.abs(b.duration - 2)).toBeLessThanOrEqual(0.15);
  expect(b.hasAudio).toBe(false);

  for (const [m, path] of [[a, withAudio], [b, noAudio]] as const) {
    const stored = await page.evaluate(async (id) => {
      const has = await window.cf.hasMedia(id);
      const f = await window.cf.getMediaFile(id);
      return { has, size: f.size };
    }, m.id);
    expect(stored.has).toBe(true);
    expect(stored.size).toBe(statSync(path).size);
  }
});

test('rejects a non-media file and leaves OPFS untouched', async ({ page }) => {
  await openHarness(page);
  await page.setInputFiles('#harness-file', noAudio);
  await page.evaluate(() => window.cf.importInputFile(0));
  const before = await page.evaluate(() => window.cf.listMediaIds());
  expect(before).toHaveLength(1);
  await page.setInputFiles('#harness-file', {
    name: 'not-a-video.mp4',
    mimeType: 'video/mp4',
    buffer: Buffer.from('this is just some text, not a video\n'.repeat(20)),
  });
  const err = await page.evaluate(async () => {
    try {
      await window.cf.importInputFile(0);
      return null;
    } catch (e) {
      return { name: (e as Error).name, message: (e as Error).message };
    }
  });
  expect(err).not.toBeNull();
  expect(err?.name).toBe('ImportError');
  // It claims to be an MP4, so the user is told it is unreadable rather than of an unsupported type.
  expect(err?.message).toBe('Could not read not-a-video.mp4: the file looks damaged or incomplete.');
  expect(await page.evaluate(() => window.cf.listMediaIds())).toEqual(before);
});

/** Imports a file built from `bytes` in the page; resolves to the MediaRef's kind or the ImportError message. */
function importBytes(page: Page, name: string, type: string, bytes: number[]): Promise<string> {
  return page.evaluate(
    async ({ name, type, bytes }) => {
      try {
        return (await window.cf.importFile(new File([new Uint8Array(bytes)], name, { type }))).kind;
      } catch (e) {
        return `${(e as Error).name}: ${(e as Error).message}`;
      }
    },
    { name, type, bytes },
  );
}

/** A valid 16-bit mono WAV header with no samples. */
function emptyWav(): number[] {
  const b = Buffer.alloc(44);
  b.write('RIFF', 0);
  b.writeUInt32LE(36, 4);
  b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16);
  b.writeUInt16LE(1, 20);
  b.writeUInt16LE(1, 22);
  b.writeUInt32LE(48000, 24);
  b.writeUInt32LE(96000, 28);
  b.writeUInt16LE(2, 32);
  b.writeUInt16LE(16, 34);
  b.write('data', 36);
  b.writeUInt32LE(0, 40);
  return [...b];
}

test('import errors say what is wrong with the file', async ({ page }) => {
  await openHarness(page);
  const truncated = [...readFileSync(join(dir, 'truncated.mp4'))];
  const junk = [...Buffer.from('definitely not an image or a video '.repeat(10))];
  expect(await importBytes(page, 'cut.mp4', 'video/mp4', truncated)).toBe(
    'ImportError: Could not read cut.mp4: the file looks damaged or incomplete.',
  );
  expect(await importBytes(page, 'notes.txt', 'text/plain', junk)).toBe('ImportError: Unsupported file type: notes.txt');
  expect(await importBytes(page, 'silence.wav', 'audio/wav', emptyWav())).toBe(
    'ImportError: silence.wav has no playable content.',
  );
  expect(await importBytes(page, 'IMG_0001.HEIC', '', junk)).toBe(
    "ImportError: IMG_0001.HEIC is a HEIC photo, which browsers can't decode. Export it as JPEG or PNG first " +
      '(on iPhone: Settings → Camera → Formats → Most Compatible).',
  );
  expect(await importBytes(page, 'scan.tiff', 'image/tiff', junk)).toBe(
    "ImportError: scan.tiff is a TIFF image, which can't be decoded by your browser. Export it as JPEG or PNG first.",
  );
  expect(await importBytes(page, 'broken.jpg', 'image/jpeg', junk)).toBe(
    'ImportError: Could not read broken.jpg: the file looks damaged or incomplete.',
  );
  expect(await page.evaluate(() => window.cf.listMediaIds())).toEqual([]);
});

test('accepts other image formats the browser can decode (WebP)', async ({ page }) => {
  await openHarness(page);
  const m = await page.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 30;
    canvas.getContext('2d')!.fillRect(0, 0, 40, 30);
    const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), 'image/webp'));
    return window.cf.importFile(new File([blob], 'photo.webp', { type: blob.type }));
  });
  expect([m.kind, m.width, m.height, m.duration]).toEqual(['image', 40, 30, 5]);
});

test('a failed putMedia over an existing id keeps the stored file', async ({ page }) => {
  await openHarness(page);
  const r = await page.evaluate(async () => {
    const id = crypto.randomUUID();
    await window.cf.putMedia(id, new Blob(['original contents']));
    const failing = {
      stream: () => new ReadableStream({ start: (c) => c.error(new Error('read failed')) }),
    } as unknown as Blob;
    const error = await window.cf.putMedia(id, failing).then(() => null, (e: Error) => e.message);
    const stored = await window.cf.getMediaFile(id).then((f) => f.text(), (e: Error) => `missing: ${e.message}`);
    // A failed first write leaves nothing behind.
    const fresh = crypto.randomUUID();
    await window.cf.putMedia(fresh, failing).catch(() => undefined);
    return { error, stored, freshExists: await window.cf.hasMedia(fresh) };
  });
  expect(r.error).toBe('read failed');
  expect(r.stored).toBe('original contents');
  expect(r.freshExists).toBe(false);
});

test('valid files in containers ClipForge cannot open are named, not called damaged', async ({ page }) => {
  await openHarness(page);
  const bytes = (f: string): number[] => [...readFileSync(join(dir, f))];
  const avi = await importBytes(page, 'holiday', 'video/x-msvideo', bytes('legacy.avi'));
  const wmv = await importBytes(page, 'talk.wmv', 'video/x-ms-wmv', bytes('legacy.wmv'));
  expect(avi).toBe(
    "ImportError: holiday is an AVI file (Audio Video Interleave), which ClipForge can't open. Convert it to MP4 first.",
  );
  expect(wmv).toBe(
    "ImportError: talk.wmv is a WMV file (Windows Media Video), which ClipForge can't open. Convert it to MP4 first.",
  );
  for (const m of [avi, wmv]) expect(m).not.toMatch(/damaged/);
  // A real MP4 that is cut short is still reported as damaged.
  expect(await importBytes(page, 'cut.mp4', 'video/mp4', bytes('truncated.mp4'))).toMatch(/damaged or incomplete/);
});
