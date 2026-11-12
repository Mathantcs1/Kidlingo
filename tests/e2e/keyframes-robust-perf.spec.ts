// Plan 5 Task 11: performance and memory guards for animation on SwiftShader. A 1080p preview frame of the 8-clip
// animated project (every property and two effects keyed per clip) costs about what the same project frozen at one
// time costs (interleaved medians, Plan 4's method); effect passes and targets are structurally the same; animated
// overlay scale changes neither the overlay texture count nor its bytes, and nothing is re-uploaded per frame.
import { test, expect } from '@playwright/test';
import { openHarness } from './harness-helpers';
import { frames } from './keyframe-helpers';
import { LEN, eightClips, frozen } from './robust-harness-helpers';
import { newOverlayClip } from '../../src/core/overlays';
import type { Clip, Project } from '../../src/core/model';

test.setTimeout(240_000);

const FORMAT = { width: 1920, height: 1080, fps: 30 };

// Ruling T11-3: the plan's 1.2x on interleaved medians holds as is (measured x0.98-1.0: evaluation is ~30 µs of a
// ~125 ms SwiftShader frame), plus structural checks: the same effect targets, no more passes than the frozen twin.
test('preview: a 1080p frame of 8 animated clips renders within 1.2x the same project frozen (interleaved medians)', async ({ page }) => {
  await openHarness(page);
  const animated = await eightClips(page);
  const still = frozen(animated, LEN / 2);
  expect(still.tracks.flatMap((t) => t.clips).some((c) => c.keys)).toBe(false);
  const times = Array.from({ length: 15 }, (_, i) => (i * 2 + 1) / 3);
  const [a, s] = await page.evaluate(({ a, b, times }) => window.cf.timeRenderPair(a, b, times), { a: animated, b: still, times });
  const ratio = a.median / s.median;
  const note = `1080p, 8 clips x (4 transform + 2 effect keys) over ${times.length} interleaved frames: frozen min ${s.min.toFixed(1)} / ` +
    `median ${s.median.toFixed(1)} ms, animated min ${a.min.toFixed(1)} / median ${a.median.toFixed(1)} ms ` +
    `(x${ratio.toFixed(3)} on medians, x${(a.min / s.min).toFixed(3)} on minima); effect passes ${a.passes} vs ${s.passes}; ` +
    `targets ${a.memory.targets} (${(a.memory.bytes / 2 ** 20).toFixed(1)} MiB) vs ${s.memory.targets}`;
  console.log(note);
  test.info().annotations.push({ type: 'performance', description: note });
  expect(a.memory).toEqual(s.memory);
  // Keyed amounts pass through neutral values (amount 0 skips the effect), so the animated frames may run fewer
  // passes than the twin frozen at mid-animation, never more.
  expect(a.passes).toBeLessThanOrEqual(s.passes);
  expect(a.passes).toBeGreaterThan(0.8 * s.passes);
  expect(ratio).toBeLessThanOrEqual(1.2);
});

/** A sticker and a lower third with scale keyed 0.5 -> 2 -> 1 (max 2), or static at 2. */
function overlays(keyed: boolean): Clip[] {
  return (['sticker', 'lowerThird'] as const).map((type, i) => {
    const c = { ...newOverlayClip(type, 0, LEN, FORMAT), id: `ov-${i}` };
    const lin = { kind: 'linear' as const };
    return keyed
      ? { ...c, keys: { scale: [{ t: 0, v: 0.5, ease: lin }, { t: 4, v: 2, ease: { kind: 'elastic' as const } }, { t: LEN, v: 1, ease: lin }] } }
      : { ...c, transform: { ...c.transform, scale: 2 } };
  });
}

test('memory: animated overlay scale keeps the overlay texture count and bytes of the static largest size; no re-upload', async ({ page }) => {
  await openHarness(page);
  const keyed: Project = await eightClips(page, 0, overlays(true));
  const still: Project = { ...keyed, tracks: keyed.tracks.map((t, i) => (i === 0 ? t : { ...t, clips: [] })) };
  const stillOverlays: Project = { ...still, tracks: [...still.tracks.slice(0, 1), ...overlays(false).map((c, i) => ({ ...keyed.tracks[i + 1], clips: [c] })), ...still.tracks.slice(3)] };
  const times = [0, 1, 2, 3.9, 4, 5, 7.5, 9.9];
  const canvas = { width: 320, height: 180 };
  const a = await frames(page, [keyed], times, canvas);
  const s = await frames(page, [stillOverlays], times, canvas);
  const note = `overlays: animated ${JSON.stringify(a.at(-1)!.overlayTextures)} uploads ${a.map((f) => f.overlayUploads).join(',')}; static at max ${JSON.stringify(s.at(-1)!.overlayTextures)} uploads ${s.map((f) => f.overlayUploads).join(',')}`;
  console.log(note);
  test.info().annotations.push({ type: 'memory', description: note });
  // The lower third redraws during its own built-in slide in/out (Ruling T13-2) in both projects; animated scale adds
  // no upload and never changes the texture size.
  for (const [i, f] of a.entries()) {
    expect(f.glError).toBe(0);
    expect(f.overlayTextures, `frame ${i}`).toEqual(s[i].overlayTextures);
  }
  expect(a.map((f) => f.overlayUploads)).toEqual(s.map((f) => f.overlayUploads));
  expect(s[0].overlayTextures.count).toBe(2);
  expect(a.at(-1)!.overlayUploads).toBeLessThanOrEqual(4);
});
