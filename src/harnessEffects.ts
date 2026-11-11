// Effect pipeline hooks for the dev harness: test-only effect shaders (never shipped) and an instrumented render.
import type { Id, Project, VideoEffectType } from './core/model';
import { openVideoSource } from './media/decode';
import type { VideoSource } from './media/decode';
import { createCompositor } from './render/compositor';
import { registerPassShader } from './render/effects/programs';
import { readPixels } from './harnessPixels';
import { TEST_SHADERS, setMidwayHook } from './harnessShaders';
import type { TestShader } from './harnessShaders';

export const effectsHarness = {
  /**
   * Registers a fresh copy of a test-only shader for `type` (a fresh object, so earlier failures of that type in
   * this page do not carry over), or removes it with null.
   */
  registerTestEffect(type: VideoEffectType, shader: TestShader | null): void {
    registerPassShader(type, shader ? { ...TEST_SHADERS[shader] } : undefined);
  },
  /**
   * Renders `p` at each time into one compositor (p.format size) and returns each frame's pixels and the effect
   * pass count after it, the onEffectUnavailable calls, the compositor's unavailableTypes() at the end, and the
   * error that stopped rendering (if any). With `loseAfter`, the context is lost after that many frames; the
   * `loseMidway` test shader loses it between its two passes.
   */
  async renderEffects(p: Project, times: number[], opts: { loseAfter?: number } = {}) {
    const canvas = document.createElement('canvas');
    const unavailable: VideoEffectType[] = [];
    const compositor = createCompositor(canvas, { preserveDrawingBuffer: true, onEffectUnavailable: (t) => unavailable.push(t) });
    const sources = new Map<Id, VideoSource>();
    const frames: { width: number; height: number; data: number[] }[] = [];
    const passes: number[] = [];
    let error: string | null = null;
    const lose = (): void => void canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
    setMidwayHook(lose);
    try {
      compositor.resize(p.format.width, p.format.height);
      for (const m of Object.values(p.media)) {
        if (m.kind === 'video' && !m.missing) sources.set(m.id, await openVideoSource(m.id));
      }
      for (const [i, t] of times.entries()) {
        if (i === opts.loseAfter) lose();
        try {
          await compositor.renderFrame(p, t, sources);
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          break;
        }
        frames.push(readPixels(canvas));
        passes.push(compositor.stats().effectPasses);
      }
      return { frames, passes, unavailable, unavailableTypes: compositor.unavailableTypes(), error };
    } finally {
      setMidwayHook(() => undefined);
      compositor.dispose();
      for (const s of sources.values()) s.close();
    }
  },
};
