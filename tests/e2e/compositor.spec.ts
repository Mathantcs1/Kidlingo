import { join } from 'node:path';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ensureFixtures } from './fixtures';
import { fitTransform } from '../../src/core/merge';
import { defaultClipAudio, newTrack } from '../../src/core/model';
import type { Clip, MediaRef, Project, Track, Transform } from '../../src/core/model';

const dir = ensureFixtures();
const withAudio = join(dir, 'with-audio.mp4');

type Rgb = [number, number, number];

async function openHarness(page: Page): Promise<void> {
  await page.goto('/harness.html');
  await page.waitForFunction(() => window.cf !== undefined);
}

/** Generates a solid-colour PNG in the page and stores it as image media. */
function imageMedia(
  page: Page,
  width: number,
  height: number,
  rgb: Rgb,
  opts?: { right?: Rgb; stripes?: number },
): Promise<MediaRef> {
  return page.evaluate(({ width, height, rgb, opts }) => window.cf.putImageMedia(width, height, rgb, opts), {
    width,
    height,
    rgb,
    opts,
  });
}

let seq = 0;
function clipOf(m: MediaRef, over: Partial<Omit<Clip, 'transform'>> & { transform?: Partial<Transform> } = {}): Clip {
  const { transform, ...rest } = over;
  return {
    id: `clip-${++seq}`,
    mediaId: m.id,
    kind: m.kind,
    start: 0,
    in: 0,
    out: 1,
    volume: 1,
    audio: defaultClipAudio(),
    fit: 'fit',
    ...rest,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1, ...transform },
  };
}

/** One video track per clip, first clip on the bottom track; plus an (ignored) audio track. */
function project(width: number, height: number, media: MediaRef[], clips: Clip[]): Project {
  const tracks: Track[] = clips.map((c, i) => ({ ...newTrack('video'), id: `track-${i}`, clips: [c] }));
  tracks.push({ ...newTrack('audio'), id: 'audio' });
  return {
    version: 3,
    format: { width, height, fps: 30 },
    tracks,
    media: Object.fromEntries(media.map((m) => [m.id, m])),
  };
}

interface Frame {
  width: number;
  height: number;
  data: number[];
  /** gl.getError() right after the render (0 = NO_ERROR). */
  glError: number;
}

/** Renders `p` at each time into a fresh canvas and returns the RGBA pixels (top-left origin). */
function render(
  page: Page,
  p: Project,
  times: number[],
  opts: { canvas?: { width: number; height: number }; sources?: boolean } = {},
): Promise<Frame[]> {
  return page.evaluate(({ p, times, opts }) => window.cf.renderPixels(p, times, opts), { p, times, opts });
}

function px(f: Frame, x: number, y: number): number[] {
  const i = (y * f.width + x) * 4;
  return f.data.slice(i, i + 4);
}

// The canvas is opaque (alpha: false), so only RGB is meaningful.
function expectRgb(f: Frame, x: number, y: number, rgb: Rgb, tol: number): void {
  const [r, g, b] = px(f, x, y);
  const msg = `pixel (${x},${y}) = ${[r, g, b]} expected ≈ ${rgb}`;
  expect(Math.abs(r - rgb[0]), msg).toBeLessThanOrEqual(tol);
  expect(Math.abs(g - rgb[1]), msg).toBeLessThanOrEqual(tol);
  expect(Math.abs(b - rgb[2]), msg).toBeLessThanOrEqual(tol);
}

test('blends tracks bottom to top with premultiplied alpha; black outside clips and beyond the timeline', async ({ page }) => {
  await openHarness(page);
  const red = await imageMedia(page, 48, 48, [255, 0, 0]);
  const green = await imageMedia(page, 32, 32, [0, 255, 0]);
  const p = project(64, 64, [red, green], [clipOf(red), clipOf(green, { transform: { opacity: 0.5 } })]);
  const [f0, f5] = await render(page, p, [0, 5]);
  expect(f0.width).toBe(64);
  expect(f0.height).toBe(64);
  expectRgb(f0, 32, 32, [128, 128, 0], 3);
  expectRgb(f0, 12, 32, [255, 0, 0], 2);
  expectRgb(f0, 32, 52, [255, 0, 0], 2);
  expectRgb(f0, 1, 1, [0, 0, 0], 0);
  expectRgb(f0, 60, 60, [0, 0, 0], 0);
  for (let y = 0; y < 64; y += 7) for (let x = 0; x < 64; x += 7) expectRgb(f5, x, y, [0, 0, 0], 0);
});

test('track order decides which clip is on top', async ({ page }) => {
  await openHarness(page);
  const red = await imageMedia(page, 48, 48, [255, 0, 0]);
  const green = await imageMedia(page, 32, 32, [0, 255, 0]);
  const p = project(64, 64, [red, green], [clipOf(green, { transform: { opacity: 0.5 } }), clipOf(red)]);
  const [f] = await render(page, p, [0]);
  expectRgb(f, 32, 32, [255, 0, 0], 2);
  const opaque = project(64, 64, [red, green], [clipOf(red), clipOf(green)]);
  const [g] = await render(page, opaque, [0]);
  expectRgb(g, 32, 32, [0, 255, 0], 2);
});

test('rotation is clockwise degrees about the clip centre; translation is canvas px with y down', async ({ page }) => {
  await openHarness(page);
  // Red left half, green right half: turning it clockwise puts red on top (counter-clockwise would put it below).
  const bar = await imageMedia(page, 48, 16, [255, 0, 0], { right: [0, 255, 0] });
  const [rot] = await render(page, project(64, 64, [bar], [clipOf(bar, { transform: { rotation: 90 } })]), [0]);
  expectRgb(rot, 32, 12, [255, 0, 0], 2);
  expectRgb(rot, 32, 50, [0, 255, 0], 2);
  expectRgb(rot, 12, 32, [0, 0, 0], 0);
  expectRgb(rot, 50, 32, [0, 0, 0], 0);
  const [ccw] = await render(page, project(64, 64, [bar], [clipOf(bar, { transform: { rotation: -90 } })]), [0]);
  expectRgb(ccw, 32, 12, [0, 255, 0], 2);
  expectRgb(ccw, 32, 50, [255, 0, 0], 2);

  const [moved] = await render(page, project(64, 64, [bar], [clipOf(bar, { transform: { y: 20, x: 4 } })]), [0]);
  // Bar now covers x [12, 60), y [44, 60).
  expectRgb(moved, 20, 50, [255, 0, 0], 2);
  expectRgb(moved, 32, 32, [0, 0, 0], 0);
  expectRgb(moved, 10, 50, [0, 0, 0], 0);
  expectRgb(moved, 58, 50, [0, 255, 0], 2);

  const [scaled] = await render(page, project(64, 64, [bar], [clipOf(bar, { transform: { scale: 0.5 } })]), [0]);
  // 24x8 bar: x [20, 44), y [28, 36).
  expectRgb(scaled, 22, 32, [255, 0, 0], 2);
  expectRgb(scaled, 42, 32, [0, 255, 0], 2);
  expectRgb(scaled, 16, 32, [0, 0, 0], 0);
  expectRgb(scaled, 32, 26, [0, 0, 0], 0);
});

test('maps the project format onto a differently sized canvas preserving aspect', async ({ page }) => {
  await openHarness(page);
  const red = await imageMedia(page, 48, 48, [255, 0, 0]);
  const [f] = await render(page, project(64, 64, [red], [clipOf(red)]), [0], { canvas: { width: 256, height: 128 } });
  expect(f.width).toBe(256);
  expect(f.height).toBe(128);
  // Viewport is 128x128 at x [64, 192); the red square covers x [80, 176), y [16, 112).
  expectRgb(f, 128, 64, [255, 0, 0], 2);
  expectRgb(f, 84, 20, [255, 0, 0], 2);
  expectRgb(f, 72, 64, [0, 0, 0], 0);
  expectRgb(f, 30, 64, [0, 0, 0], 0);
  expectRgb(f, 128, 8, [0, 0, 0], 0);
});

test('skips clips whose media is missing or whose video source is absent', async ({ page }) => {
  await openHarness(page);
  const red = await imageMedia(page, 48, 48, [255, 0, 0]);
  const [f] = await render(page, project(64, 64, [{ ...red, missing: true }], [clipOf(red)]), [0]);
  expectRgb(f, 32, 32, [0, 0, 0], 0);

  await page.setInputFiles('#harness-file', [withAudio]);
  const video = await page.evaluate(() => window.cf.importInputFile(0));
  const clip = clipOf(video, { out: 3, transform: fitTransform({ width: 640, height: 360 }, { width: 64, height: 36 }, 'fit') });
  const [g] = await render(page, project(64, 36, [video], [clip]), [1], { sources: false });
  expectRgb(g, 32, 18, [0, 0, 0], 0);
});

test('renders decoded video frames at clip.in + (t - clip.start)', async ({ page }) => {
  await openHarness(page);
  await page.setInputFiles('#harness-file', [withAudio]);
  const video = await page.evaluate(() => window.cf.importInputFile(0));
  const transform = fitTransform({ width: 640, height: 360 }, { width: 64, height: 36 }, 'fit');
  const clip = clipOf(video, { out: 3, transform });
  const [a, b, c] = await render(page, project(64, 36, [video], [clip]), [1.0, 0.2, 1.5]);
  const centre = px(a, 32, 18);
  expect(Math.max(centre[0], centre[1], centre[2]), `centre ${centre}`).toBeGreaterThan(10);
  expect(b.data).not.toEqual(c.data);

  // The same source frame through a trimmed, shifted clip: in 0.7, start 0.5 → t 1.0 shows source 1.2.
  const shifted = clipOf(video, { start: 0.5, in: 0.7, out: 3, transform });
  const direct = clipOf(video, { out: 3, transform });
  const [s] = await render(page, project(64, 36, [video], [shifted]), [1.0]);
  const [d] = await render(page, project(64, 36, [video], [direct]), [1.2]);
  expect(s.data).toEqual(d.data);
});

test('an image that fails to decode is tried once per compositor and skipped; other clips still draw', async ({ page }) => {
  await openHarness(page);
  const red = await imageMedia(page, 48, 48, [255, 0, 0]);
  const corrupt = await page.evaluate(async () => {
    const bytes = new Uint8Array(100);
    crypto.getRandomValues(bytes);
    const id = crypto.randomUUID();
    await window.cf.putMedia(id, new Blob([bytes]));
    // Count decode attempts of the corrupt file (the only 100-byte blob).
    const original = window.createImageBitmap.bind(window);
    const w = window as unknown as { corruptDecodes: number; createImageBitmap: typeof createImageBitmap };
    w.corruptDecodes = 0;
    w.createImageBitmap = ((src: ImageBitmapSource, ...rest: unknown[]) => {
      if (src instanceof Blob && src.size === 100) w.corruptDecodes++;
      return (original as (...a: unknown[]) => Promise<ImageBitmap>)(src, ...rest);
    }) as typeof createImageBitmap;
    return { id, name: 'corrupt.png', kind: 'image', duration: 5, width: 32, height: 32, hasAudio: false } as const;
  });
  const p = project(64, 64, [red, corrupt], [clipOf(red), clipOf(corrupt)]);
  const frames = await render(page, p, [0, 0, 0, 0.1, 0.5]);
  for (const f of frames) {
    expectRgb(f, 32, 32, [255, 0, 0], 2);
    expect(f.glError).toBe(0);
  }
  expect(await page.evaluate(() => (window as unknown as { corruptDecodes: number }).corruptDecodes)).toBe(1);
});

test('a clip whose media is not in the project is skipped without GL errors', async ({ page }) => {
  await openHarness(page);
  const red = await imageMedia(page, 48, 48, [255, 0, 0]);
  const stray = await imageMedia(page, 32, 32, [0, 255, 0]);
  // `stray` is stored in OPFS but absent from p.media.
  const p = project(64, 64, [red], [clipOf(red), clipOf(stray)]);
  const frames = await render(page, p, [0, 0.5]);
  for (const f of frames) {
    expect(f.glError).toBe(0);
    expectRgb(f, 32, 32, [255, 0, 0], 2);
  }
});

test('one source used by two clips in the same frame shows each clip its own source time', async ({ page }) => {
  await openHarness(page);
  await page.setInputFiles('#harness-file', [withAudio]);
  const video = await page.evaluate(() => window.cf.importInputFile(0));
  // 32x18 halves of a 64x18 canvas: left shows source 0.2 s, right shows source 1.5 s.
  const left = (): Clip => clipOf(video, { in: 0.2, out: 3, transform: { scale: 0.05, x: -16 } });
  const right = (): Clip => clipOf(video, { in: 1.5, out: 3, transform: { scale: 0.05, x: 16 } });
  const [both] = await render(page, project(64, 18, [video], [left(), right()]), [0]);
  const [l] = await render(page, project(64, 18, [video], [left()]), [0]);
  const [r] = await render(page, project(64, 18, [video], [right()]), [0]);
  const half = (f: Frame, x0: number): number[] => {
    const out: number[] = [];
    for (let y = 0; y < f.height; y++) out.push(...f.data.slice((y * f.width + x0) * 4, (y * f.width + x0 + 32) * 4));
    return out;
  };
  expect(half(both, 0)).toEqual(half(l, 0));
  expect(half(both, 32)).toEqual(half(r, 32));
  // The two source times really are different pictures (otherwise the test proves nothing).
  expect(half(l, 0)).not.toEqual(half(r, 32));
});

test('serialises overlapping renders, is idempotent to dispose and rejects after it, reports context loss', async ({ page }) => {
  await openHarness(page);
  const red = await imageMedia(page, 48, 48, [255, 0, 0]);
  const green = await imageMedia(page, 32, 32, [0, 255, 0]);
  const p = project(64, 64, [red, green], [clipOf(red), clipOf(green)]);
  const r = await page.evaluate(async (p) => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const comp = window.cf.createCompositor(canvas, { preserveDrawingBuffer: true });
    // Overlapping calls: the later one wins.
    await Promise.all([comp.renderFrame(p, 0, new Map()), comp.renderFrame(p, 5, new Map())]);
    const after = window.cf.readPixels(canvas).data.slice((32 * 64 + 32) * 4, (32 * 64 + 32) * 4 + 4);
    const gl = canvas.getContext('webgl2');
    const glError = gl ? gl.getError() : -1;
    comp.dispose();
    comp.dispose();
    const disposed = await comp.renderFrame(p, 0, new Map()).then(
      () => 'resolved',
      (e: Error) => e.message,
    );

    const c2 = document.createElement('canvas');
    c2.width = 64;
    c2.height = 64;
    const comp2 = window.cf.createCompositor(c2);
    await comp2.renderFrame(p, 0, new Map());
    c2.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    const lost = await comp2.renderFrame(p, 0, new Map()).then(
      () => 'resolved',
      (e: Error) => e.message,
    );
    comp2.dispose();
    return { after, glError, disposed, lost };
  }, p);
  expect(r.after).toEqual([0, 0, 0, 255]);
  expect(r.glError).toBe(0);
  expect(r.disposed).toMatch(/disposed/i);
  expect(r.lost).toBe('WebGL context lost');
});
