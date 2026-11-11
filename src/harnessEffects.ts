// Effect pipeline hooks for the dev harness: test-only effect shaders (never shipped) and an instrumented render.
import type { Id, Project, VideoEffectType } from './core/model';
import { openVideoSource } from './media/decode';
import type { VideoSource } from './media/decode';
import { createCompositor } from './render/compositor';
import { registerPassShader } from './render/effects/programs';
import { PASSTHROUGH } from './render/effects/shaders/passthrough';
import type { PassShader } from './render/effects/types';
import { readPixels } from './harnessPixels';

const fragment = (body: string, decls = ''): string => `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
uniform float u_time;
uniform float u_frame;
${decls}
out vec4 outColor;
void main() {
  vec4 c = texture(u_src, v_uv);
  ${body}
}`;

/** Premultiplied invert: un-premultiplied 1 − rgb, times alpha, is alpha − rgb. */
const INVERT: PassShader = { fragment: fragment('outColor = vec4(c.a - c.rgb, c.a);'), uniforms: () => ({}) };

export const TEST_SHADERS = {
  passthrough: PASSTHROUGH,
  invert: INVERT,
  /** Two passes of the invert program through the multi-pass hook: output = input, 2 passes. */
  invertTwice: { ...INVERT, run: (pass) => { pass.draw({}); pass.draw({}); } } as PassShader,
  /** Scales the picture by params.amount through a custom uniform. */
  gain: { fragment: fragment('outColor = c * u_gain;', 'uniform float u_gain;'), uniforms: (p) => ({ u_gain: p.amount }) } as PassShader,
  /** Writes the clip-relative frame index (red) and snapped time × 30 (green) in 1/255 steps. */
  frame: { fragment: fragment('outColor = vec4(u_frame / 255.0, u_time * 30.0 / 255.0, 0.0, 1.0);'), uniforms: () => ({}) } as PassShader,
  /** Does not compile. */
  broken: { fragment: '#version 300 es\nthis is not glsl;', uniforms: () => ({}) } as PassShader,
} satisfies Record<string, PassShader>;

export type TestShader = keyof typeof TEST_SHADERS;

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
   * pass count after it, the onEffectUnavailable calls, and the error that stopped rendering (if any). With
   * `loseAfter`, the context is lost after that many frames.
   */
  async renderEffects(p: Project, times: number[], opts: { loseAfter?: number } = {}) {
    const canvas = document.createElement('canvas');
    const unavailable: VideoEffectType[] = [];
    const compositor = createCompositor(canvas, { preserveDrawingBuffer: true, onEffectUnavailable: (t) => unavailable.push(t) });
    const sources = new Map<Id, VideoSource>();
    const frames: { width: number; height: number; data: number[] }[] = [];
    const passes: number[] = [];
    let error: string | null = null;
    try {
      compositor.resize(p.format.width, p.format.height);
      for (const m of Object.values(p.media)) {
        if (m.kind === 'video' && !m.missing) sources.set(m.id, await openVideoSource(m.id));
      }
      for (const [i, t] of times.entries()) {
        if (i === opts.loseAfter) canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
        try {
          await compositor.renderFrame(p, t, sources);
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
          break;
        }
        frames.push(readPixels(canvas));
        passes.push(compositor.stats().effectPasses);
      }
      return { frames, passes, unavailable, error };
    } finally {
      compositor.dispose();
      for (const s of sources.values()) s.close();
    }
  },
};
