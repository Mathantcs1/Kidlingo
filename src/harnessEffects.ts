// Effect pipeline hooks for the dev harness: test-only effect shaders (never shipped) and an instrumented render.
import type { Id, Project, VideoEffectType } from './core/model';
import { openVideoSource } from './media/decode';
import { importLut } from './media/lutImport';
import type { VideoSource } from './media/decode';
import { createCompositor } from './render/compositor';
import { registerPassShader } from './render/effects/programs';
import { readPixels } from './harnessPixels';
import { exportProject } from './export/exporter';
import type { ExportSkips } from './render/effects/unavailable';
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
  /** Imports `text` as a .cube file named `name` through importLut (the app's LUT import). */
  importLutText(text: string, name = 'test.cube') {
    return importLut(new File([text], name, { type: 'application/octet-stream' }));
  },
  /**
   * Renders `p` at each time into one compositor (p.format size) and returns each frame's pixels, the effect pass
   * count and effect target memory after it, the onEffectUnavailable calls, the compositor's unavailableTypes() at
   * the end, the error that stopped rendering (if any), and the onLutUnavailable calls ([media id, name]). With
   * `loseAfter`, the context is lost after that many frames; the `loseMidway` test shader loses it between its two
   * passes.
   */
  async renderEffects(p: Project, times: number[], opts: { loseAfter?: number } = {}) {
    const canvas = document.createElement('canvas');
    const unavailable: VideoEffectType[] = [];
    const lutUnavailable: [Id, string][] = [];
    const compositor = createCompositor(canvas, {
      preserveDrawingBuffer: true,
      onEffectUnavailable: (t) => unavailable.push(t),
      onLutUnavailable: (id, name) => lutUnavailable.push([id, name]),
    });
    const sources = new Map<Id, VideoSource>();
    const frames: { width: number; height: number; data: number[] }[] = [];
    const passes: number[] = [];
    const memory: { targets: number; bytes: number }[] = [];
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
        memory.push(compositor.stats().effectMemory);
      }
      return { frames, passes, memory, unavailable, unavailableTypes: compositor.unavailableTypes(), error, lutUnavailable };
    } finally {
      setMidwayHook(() => undefined);
      compositor.dispose();
      for (const s of sources.values()) s.close();
    }
  },
  /**
   * Renders `p` at each time into one compositor at p.format size (the preview at export size) and returns each
   * frame as base64 RGB (top row first), the effect pass count after it and the effect target memory.
   */
  async renderRgb(p: Project, times: number[]) {
    const r = await withCompositor(p, async (compositor, canvas, sources) => {
      const frames: string[] = [];
      for (const t of times) {
        await compositor.renderFrame(p, t, sources);
        const { data } = readPixels(canvas);
        const rgb = new Uint8Array((data.length / 4) * 3);
        for (let i = 0, j = 0; i < data.length; i += 4, j += 3) rgb.set([data[i], data[i + 1], data[i + 2]], j);
        frames.push(base64(rgb));
      }
      return { frames, passes: compositor.stats().effectPasses, memory: compositor.stats().effectMemory };
    });
    return { width: p.format.width, height: p.format.height, ...r };
  },
  /**
   * Times rendering `a` and `b` (each at its p.format size, in its own compositor) frame by frame, INTERLEAVED (a, b,
   * a, b, ...) so both see the same machine load, after `warmup` frames each at times[0]. Every frame is synced with
   * gl.finish and a 1-pixel read so the GPU work is counted. Returns per project the median and minimum ms, every
   * timing, the effect pass count and the effect target memory at the end.
   */
  async timeRenderPair(a: Project, b: Project, times: number[], warmup = 2) {
    return withCompositor(a, (ca, canvasA, srcA) => withCompositor(b, async (cb, canvasB, srcB) => {
      const px = new Uint8Array(4);
      const frame = async (c: typeof ca, canvas: HTMLCanvasElement, p: Project, src: typeof srcA, t: number): Promise<number> => {
        const gl = canvas.getContext('webgl2')!;
        const t0 = performance.now();
        await c.renderFrame(p, t, src);
        gl.finish();
        gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
        return performance.now() - t0;
      };
      const all: [number[], number[]] = [[], []];
      for (let i = -warmup; i < times.length; i++) {
        const t = times[Math.max(0, i)];
        const ms = [await frame(ca, canvasA, a, srcA, t), await frame(cb, canvasB, b, srcB, t)];
        if (i >= 0) ms.forEach((v, k) => all[k].push(v));
      }
      return ([ca, cb] as const).map((c, k) => {
        const sorted = [...all[k]].sort((x, y) => x - y);
        const { effectPasses: passes, effectMemory: memory } = c.stats();
        return { median: sorted[Math.floor(sorted.length / 2)], min: sorted[0], all: all[k], passes, memory };
      });
    }));
  },
  /** Exports `p` ('1080p', optional test-only long side) and returns the file as base64 plus the export's skips. */
  async exportWithSkips(p: Project, maxLongSide?: number): Promise<{ b64: string; skips: ExportSkips | null }> {
    let skips: ExportSkips | null = null;
    const blob = await exportProject(p, {
      quality: '1080p',
      maxLongSide,
      signal: new AbortController().signal,
      onProgress: () => undefined,
      onSkipped: (s) => (skips = s),
    });
    return { b64: base64(new Uint8Array(await blob.arrayBuffer())), skips };
  },
  /**
   * Exports `p` (tiny, `maxLongSide`) with the `loseMidway` test shader on `type`: its `lostAt`-th call (0-based)
   * loses the export compositor's WebGL context between its two passes. Returns the error the export rejected with.
   */
  async exportLosingContext(p: Project, type: VideoEffectType, lostAt: number, maxLongSide: number) {
    const contexts: WebGL2RenderingContext[] = [];
    const protos = [OffscreenCanvas.prototype, HTMLCanvasElement.prototype] as { getContext: (...a: unknown[]) => unknown }[];
    const originals = protos.map((proto) => proto.getContext);
    protos.forEach((proto, i) => {
      proto.getContext = function (this: unknown, ...args: unknown[]) {
        const ctx = originals[i].apply(this, args);
        if (args[0] === 'webgl2' && ctx) contexts.push(ctx as WebGL2RenderingContext);
        return ctx;
      };
    });
    let calls = 0;
    setMidwayHook(() => {
      if (calls++ === lostAt) contexts.at(-1)?.getExtension('WEBGL_lose_context')?.loseContext();
    });
    registerPassShader(type, { ...TEST_SHADERS.loseMidway });
    try {
      await exportProject(p, { quality: '1080p', maxLongSide, signal: new AbortController().signal, onProgress: () => undefined });
      return { error: null, calls, contexts: contexts.length };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e), calls, contexts: contexts.length };
    } finally {
      protos.forEach((proto, i) => (proto.getContext = originals[i]));
      setMidwayHook(() => undefined);
    }
  },
};

/** Runs `fn` with a fresh compositor at p.format size and a VideoSource per (non-missing) video media; disposes both. */
async function withCompositor<T>(
  p: Project,
  fn: (c: ReturnType<typeof createCompositor>, canvas: HTMLCanvasElement, sources: Map<Id, VideoSource>) => Promise<T>,
): Promise<T> {
  const canvas = document.createElement('canvas');
  const compositor = createCompositor(canvas, { preserveDrawingBuffer: true });
  const sources = new Map<Id, VideoSource>();
  try {
    compositor.resize(p.format.width, p.format.height);
    for (const m of Object.values(p.media)) if (m.kind === 'video' && !m.missing) sources.set(m.id, await openVideoSource(m.id));
    return await fn(compositor, canvas, sources);
  } finally {
    compositor.dispose();
    for (const s of sources.values()) s.close();
  }
}

function base64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
