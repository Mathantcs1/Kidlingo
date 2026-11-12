// Blend-mode hooks for the dev harness (not part of the app build): an instrumented render through ONE compositor.
import type { Project } from './core/model';
import { createCompositor } from './render/compositor';
import { readPixels } from './harnessPixels';

export const blendHarness = {
  /**
   * Renders `p` at each time into one compositor (canvas: `canvas` or p.format size; each frame may use its own
   * project from `projects`) and returns each frame's pixels with the compositor's blend pass count, composite memory,
   * effect pass count and GL error after it, and the error that stopped rendering. With `loseAfter`, the context is
   * lost before that frame.
   */
  async renderBlend(
    projects: Project[],
    times: number[],
    opts: { canvas?: { width: number; height: number }; loseAfter?: number } = {},
  ) {
    const canvas = document.createElement('canvas');
    const compositor = createCompositor(canvas, { preserveDrawingBuffer: true });
    const out: {
      width: number; height: number; data: number[]; glError: number;
      blendPasses: number; compositeMemory: { targets: number; bytes: number }; effectPasses: number;
      overlayTextures: { count: number; bytes: number }; overlayUploads: number;
    }[] = [];
    let error: string | null = null;
    try {
      const f = projects[0].format;
      compositor.resize(opts.canvas?.width ?? f.width, opts.canvas?.height ?? f.height);
      for (const [i, t] of times.entries()) {
        const gl = canvas.getContext('webgl2');
        if (i === opts.loseAfter) gl?.getExtension('WEBGL_lose_context')?.loseContext();
        try {
          await compositor.renderFrame(projects[Math.min(i, projects.length - 1)], t, new Map());
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          break;
        }
        const s = compositor.stats();
        out.push({
          ...readPixels(canvas), glError: gl?.getError() ?? -1,
          blendPasses: s.blendPasses, compositeMemory: s.compositeMemory, effectPasses: s.effectPasses,
          overlayTextures: s.overlayTextures, overlayUploads: s.overlayUploads,
        });
      }
      return { frames: out, error };
    } finally {
      compositor.dispose();
    }
  },
};
