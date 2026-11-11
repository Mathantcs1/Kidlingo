import { afterEach, describe, expect, it, vi } from 'vitest';
import { EffectPipeline } from '../src/render/effects/pipeline';
import { PASS_SHADERS, registerPassShader, uniformCall, unavailableTypes } from '../src/render/effects/programs';
import type { EffectContext, PassShader, Uniforms } from '../src/render/effects/types';
import type { VideoEffect, VideoEffectType } from '../src/core/model';
import type { Mat3, TextureSlot } from '../src/render/gl';
import { TEST_SHADERS } from '../src/harnessShaders';
import { fakeGl } from './fake-gl';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const ok: PassShader = { fragment: 'ok', uniforms: () => ({}) };
const ctx = (onUnavailable = vi.fn()): EffectContext => ({ time: 0, frame: 0, fps: 30, lut: () => null, onUnavailable });
const fx = (type: VideoEffectType): VideoEffect => ({ id: `e-${type}`, type, enabled: true, params: { amount: 1 } });
const input = (): TextureSlot => ({ tex: { kind: 'input' } as unknown as WebGLTexture, width: 8, height: 8 });
const saved = new Map<VideoEffectType, PassShader | undefined>();
const register = (type: VideoEffectType, shader: PassShader): void => {
  if (!saved.has(type)) saved.set(type, PASS_SHADERS[type]);
  registerPassShader(type, shader);
};

// Restores the shipped shaders (blur, glow, …) rather than deleting them.
afterEach(() => {
  for (const [t, s] of saved) registerPassShader(t, s);
  saved.clear();
});

describe('a lost context during run is always "WebGL context lost"', () => {
  it('when the context is already lost (getParameter returns null)', () => {
    register('invert', ok);
    const { gl, state } = fakeGl();
    const pipeline = new EffectPipeline(gl);
    pipeline.run(input(), { width: 8, height: 8 }, IDENTITY, [fx('invert')], ctx());
    state.lost = true;
    expect(() => pipeline.run(input(), { width: 8, height: 8 }, IDENTITY, [fx('invert')], ctx())).toThrow(/^WebGL context lost$/);
  });

  it('when it is lost between two passes of a multi-pass effect (and the effect is not marked unavailable)', () => {
    const { gl, state } = fakeGl();
    register('blur', { ...ok, run: (pass) => { pass.draw({}); state.lost = true; pass.draw({}); } });
    const onUnavailable = vi.fn();
    expect(() => new EffectPipeline(gl).run(input(), { width: 8, height: 8 }, IDENTITY, [fx('blur')], ctx(onUnavailable)))
      .toThrow(/^WebGL context lost$/);
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(unavailableTypes()).not.toContain('blur');
  });

  it('when target allocation fails because the context was lost', () => {
    register('invert', ok);
    const { gl, state } = fakeGl({ createFramebuffer: () => { state.lost = true; return null; } });
    expect(() => new EffectPipeline(gl).run(input(), { width: 8, height: 8 }, IDENTITY, [fx('invert')], ctx()))
      .toThrow(/^WebGL context lost$/);
  });
});

describe('ping-pong target pool', () => {
  it('alternating two sizes allocates each pair once; a pass never samples the target it writes', () => {
    register('invert', ok);
    register('bw', ok);
    const { gl, log, count, k } = fakeGl();
    const pipeline = new EffectPipeline(gl);
    const src = input();
    for (let i = 0; i < 6; i++) {
      const size = i % 2 ? { width: 4, height: 2 } : { width: 8, height: 8 };
      pipeline.run(src, size, IDENTITY, [fx('invert'), fx('bw')], ctx());
    }
    expect(count('texImage2D')).toBe(4);
    expect(pipeline.passes).toBe(12);
    let fbo: unknown = null;
    let tex: unknown = null;
    const attached = new Map<unknown, unknown>();
    for (const [name, a] of log) {
      if (name === 'bindFramebuffer') fbo = a[1];
      if (name === 'bindTexture' && a[0] === k('TEXTURE_2D')) tex = a[1];
      if (name === 'framebufferTexture2D') attached.set(fbo, a[3]);
      if (name === 'drawArrays') {
        expect(fbo).not.toBeNull();
        expect(tex).not.toBe(attached.get(fbo));
      }
    }
    expect([...attached.values()]).not.toContain(src.tex);
  });

  it('keeps at most 3 pairs (least recently used evicted); dispose frees every one', () => {
    register('invert', ok);
    const { gl, count } = fakeGl();
    const pipeline = new EffectPipeline(gl);
    for (const w of [1, 2, 3, 4, 1]) pipeline.run(input(), { width: w, height: 1 }, IDENTITY, [fx('invert')], ctx());
    // One pass binds one target of the pair: 4 sizes, then size 1 again after it was evicted.
    expect(count('texImage2D')).toBe(5);
    expect(count('deleteFramebuffer')).toBe(4);
    pipeline.dispose();
    expect(count('deleteFramebuffer')).toBe(count('createFramebuffer'));
  });
});

describe('effect errors are contained (D8)', () => {
  it('an effect whose uniforms() throws is skipped, reported once per session, and the next effect still applies', () => {
    register('sepia', { ...ok, uniforms: () => { throw new Error('bug'); } });
    register('invert', ok);
    const { gl } = fakeGl();
    const pipeline = new EffectPipeline(gl);
    const onUnavailable = vi.fn();
    const src = input();
    expect(pipeline.run(src, { width: 8, height: 8 }, IDENTITY, [fx('sepia')], ctx(onUnavailable))).toBe(src);
    const out = pipeline.run(src, { width: 8, height: 8 }, IDENTITY, [fx('sepia'), fx('invert')], ctx(onUnavailable));
    expect(out).not.toBe(src);
    expect(pipeline.passes).toBe(1);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
    expect(onUnavailable).toHaveBeenCalledWith('sepia');
    expect(unavailableTypes()).toContain('sepia');
  });

  it('a multi-pass effect that throws half way is rolled back to its input', () => {
    register('glow', { ...ok, run: (pass) => { pass.draw({}); throw new Error('half way'); } });
    const { gl } = fakeGl();
    const src = input();
    const onUnavailable = vi.fn();
    expect(new EffectPipeline(gl).run(src, { width: 8, height: 8 }, IDENTITY, [fx('glow')], ctx(onUnavailable))).toBe(src);
    expect(onUnavailable).toHaveBeenCalledWith('glow');
  });

  it('a uniform vector of an unsupported length is contained', () => {
    register('vhs', { ...ok, uniforms: () => ({ u_bad: [1, 2, 3, 4, 5] }) });
    const { gl } = fakeGl();
    const src = input();
    const onUnavailable = vi.fn();
    expect(new EffectPipeline(gl).run(src, { width: 8, height: 8 }, IDENTITY, [fx('vhs')], ctx(onUnavailable))).toBe(src);
    expect(onUnavailable).toHaveBeenCalledTimes(1);
  });
});

describe('test-only shaders use only float/vec uniforms', () => {
  const TYPES: Record<string, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };
  for (const [name, shader] of Object.entries(TEST_SHADERS)) {
    it(name, () => {
      const declared = new Map<string, string>();
      for (const m of shader.fragment.matchAll(/uniform\s+(\w+)\s+(\w+)\s*;/g)) declared.set(m[2], m[1]);
      for (const [uniform, type] of declared) {
        if (uniform === 'u_src') expect(type).toBe('sampler2D');
        else expect(Object.keys(TYPES), `${uniform}: ${type}`).toContain(type);
      }
      let values: Uniforms = {};
      try {
        values = shader.uniforms({ amount: 0.5 }, ctx(), { width: 8, height: 8 });
      } catch {
        return; // a deliberately throwing test shader
      }
      for (const [uniform, v] of Object.entries(values)) {
        if (name === 'badVector') continue;
        const type = declared.get(uniform);
        expect(type, `${uniform} is declared`).toBeDefined();
        const [setter] = uniformCall(v);
        expect(setter).toBe(TYPES[type!] === 1 ? 'uniform1f' : `uniform${TYPES[type!]}fv`);
      }
    });
  }
});
