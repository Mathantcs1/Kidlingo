// Shared helpers for the Plan 5B render specs (Task 6): preset slots built from the library defaults, and the core
// oracle (the SAME resolver the compositor calls) for expected pixels.
import type { Page } from '@playwright/test';
import { resolveClip } from '../../src/core/animate';
import type { Ease } from '../../src/core/easing';
import type { Clip } from '../../src/core/model';
import type { EmphasisUse, LoopUse, MotionSlot, PresetKey, PresetUse } from '../../src/core/motionTypes';
import { PRESETS, presetEase, presetParams } from '../../src/core/presets';

export interface UseOver {
  duration?: number;
  delay?: number;
  ease?: Ease;
  params?: Record<string, number>;
}

/** A slot of `key` with the library defaults for `slot`; `over` replaces timing/ease and merges params. */
export function use(key: PresetKey, slot: MotionSlot, over: UseOver = {}): PresetUse {
  return {
    preset: key,
    duration: over.duration ?? PRESETS[key].defaultDuration,
    delay: over.delay ?? 0,
    ease: over.ease ?? presetEase(key, slot),
    params: { ...presetParams(key, slot), ...over.params },
  };
}

export const emphasis = (key: PresetKey, at: number, over: UseOver = {}): EmphasisUse => ({ ...use(key, 'emphasis', over), delay: 0, at });
export const loop = (key: PresetKey, over: UseOver & { phase?: number; count?: number | null } = {}): LoopUse =>
  ({ ...use(key, 'loop', over), delay: 0, phase: over.phase ?? 0, count: over.count ?? null });

export const LINEAR: Ease = { kind: 'linear' };

/** The drawn transform the compositor must show for `c` at `t` (core oracle). */
export const drawn = (c: Clip, t: number, format: { width: number; height: number; fps: number }) => resolveClip(c, t, format).transform;

/** The GL the static/5A hash literals were recorded on (keyframes-render-fx.spec.ts, Plan 5 Task 5). */
export const STATIC_HASHES_GL = 'ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver) | WebGL 2.0 (OpenGL ES 3.0 Chromium)';

/** The page's WebGL2 renderer and version (rasteriser output, and so a hash literal, is machine-dependent). */
export function glIdentity(page: Page): Promise<string> {
  return page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return 'no webgl2';
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    return `${renderer} | ${String(gl.getParameter(gl.VERSION))}`;
  });
}
