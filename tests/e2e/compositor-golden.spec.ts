// Characterisation guard for the compositor: representative scenes rendered at 96x54 must keep matching the
// goldens captured before the Plan 4 split/effect work (a clip without effects must draw exactly as before).
// Regenerate on purpose with: UPDATE_GOLDEN=1 npx playwright test tests/e2e/compositor-golden.spec.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import { ROTATED, ensureFixtures } from './fixtures';
import { clipOf, importPaths, openHarness, render } from './harness-helpers';
import type { Frame, Rgb } from './harness-helpers';
import { fitTransform } from '../../src/core/merge';
import { newTrack } from '../../src/core/model';
import type { Clip, MediaRef, Project, Track } from '../../src/core/model';

test.setTimeout(180_000);

const GOLDEN = fileURLToPath(new URL('./golden/compositor.json', import.meta.url));
const update = process.env.UPDATE_GOLDEN === '1';
const stored: Record<string, string> = existsSync(GOLDEN) ? JSON.parse(readFileSync(GOLDEN, 'utf8')) : {};
const fresh: Record<string, string> = {};
const dir = ensureFixtures();

const W = 96;
const H = 54;
const FMT = { width: W, height: H, fps: 30 };

const image = (page: Page, w: number, h: number, rgb: Rgb, opts?: { right?: Rgb }): Promise<MediaRef> =>
  page.evaluate(({ w, h, rgb, opts }) => window.cf.putImageMedia(w, h, rgb, opts), { w, h, rgb, opts });

function proj(tracks: Track[], media: MediaRef[]): Project {
  return { version: 4, format: FMT, tracks: [...tracks, { ...newTrack('audio'), id: 'audio' }], media: Object.fromEntries(media.map((m) => [m.id, m])), luts: {} };
}
const vtrack = (id: string, clips: Clip[], over: Partial<Track> = {}): Track => ({ ...newTrack('video'), id, clips, ...over });

/** RGB bytes of the frame, base64 (top row first). */
function pack(f: Frame): string {
  const out = Buffer.alloc(f.width * f.height * 3);
  for (let i = 0, j = 0; i < f.data.length; i += 4) {
    out[j++] = f.data[i];
    out[j++] = f.data[i + 1];
    out[j++] = f.data[i + 2];
  }
  return out.toString('base64');
}

function check(name: string, f: Frame): void {
  expect(f.glError).toBe(0);
  const got = pack(f);
  fresh[name] = got;
  if (update) return;
  expect(stored[name], `no golden for ${name}; run with UPDATE_GOLDEN=1 on the pre-split code`).toBeDefined();
  const a = Buffer.from(got, 'base64');
  const b = Buffer.from(stored[name], 'base64');
  expect(a.length).toBe(b.length);
  let worst = 0;
  let at = -1;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > worst) {
      worst = d;
      at = i;
    }
  }
  expect(worst, `${name}: worst channel diff ${worst} at byte ${at}`).toBeLessThanOrEqual(1);
}

test.afterAll(() => {
  if (!update) return;
  mkdirSync(dirname(GOLDEN), { recursive: true });
  writeFileSync(GOLDEN, JSON.stringify({ ...stored, ...fresh }, null, 1) + '\n');
});

test('two layers: 60% opacity rotated clip over a split image', async ({ page }) => {
  await openHarness(page);
  const base = await image(page, 64, 36, [200, 40, 40], { right: [40, 40, 200] });
  const top = await image(page, 40, 20, [40, 220, 60], { right: [240, 220, 40] });
  const baseClip = clipOf(base, { out: 2, transform: fitTransform({ width: 64, height: 36 }, FMT, 'fit') });
  const topClip = clipOf(top, { out: 2, transform: { x: 10, y: -6, scale: 1.2, rotation: 30, opacity: 0.6 } });
  const p = proj([vtrack('v1', [baseClip]), vtrack('v2', [topClip])], [base, top]);
  const [f] = await render(page, p, [0.5]);
  check('two-layers', f);
});

test("fit 'blur': a portrait image in a 16:9 project", async ({ page }) => {
  await openHarness(page);
  const tall = await image(page, 30, 60, [230, 120, 20], { right: [20, 120, 230] });
  const clip = clipOf(tall, { out: 2, fit: 'blur', transform: fitTransform({ width: 30, height: 60 }, FMT, 'fit') });
  const [f] = await render(page, proj([vtrack('v1', [clip])], [tall]), [0.5]);
  check('blur-fit', f);
});

test('video frames, and a rotated phone video drawn upright', async ({ page }) => {
  await openHarness(page);
  const [quad, rot90] = await importPaths(page, [join(dir, 'quad.mp4'), join(dir, ROTATED[90])]);
  const size = (m: MediaRef) => ({ width: m.width!, height: m.height! });
  const a = clipOf(quad, { transform: fitTransform(size(quad), FMT, 'fit') });
  const [f1, f2] = await render(page, proj([vtrack('v1', [a])], [quad]), [0.5, 1.5]);
  check('video-0.5s', f1);
  check('video-1.5s', f2);
  const b = clipOf(rot90, { transform: fitTransform(size(rot90), FMT, 'fill'), fit: 'fill' });
  const [r] = await render(page, proj([vtrack('v1', [b])], [rot90]), [0.5]);
  check('video-rotated-90', r);
});

test('a hidden layer is not drawn', async ({ page }) => {
  await openHarness(page);
  const lower = await image(page, 32, 18, [30, 160, 200]);
  const upper = await image(page, 32, 18, [220, 200, 30]);
  const t = fitTransform({ width: 32, height: 18 }, FMT, 'fit');
  const p = proj(
    [vtrack('v1', [clipOf(lower, { out: 2, transform: t })]), vtrack('v2', [clipOf(upper, { out: 2, transform: { ...t, scale: t.scale * 0.5 } })], { hidden: true })],
    [lower, upper],
  );
  const [f] = await render(page, p, [0.5]);
  check('hidden-layer', f);
});
