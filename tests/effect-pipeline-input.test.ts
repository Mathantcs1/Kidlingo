// Multi-pass effects that read their own input (Plan 4 Task 7: unsharp mask, glow): the third pool target.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EffectPipeline } from '../src/render/effects/pipeline';
import { registerPassShader, uniformCall } from '../src/render/effects/programs';
import { PASS_SHADERS } from '../src/render/effects/programs';
import type { EffectContext, PassShader } from '../src/render/effects/types';
import type { VideoEffect, VideoEffectType } from '../src/core/model';
import type { Mat3, TextureSlot } from '../src/render/gl';
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
afterEach(() => {
  for (const [t, s] of saved) registerPassShader(t, s);
  saved.clear();
});

/** Replays the fake GL log: for each draw, the texture written, the u_src texture and the texture on unit 1. */
function draws(log: [string, unknown[]][], k: (n: string) => number) {
  let fbo: unknown = null;
  let unit = k('TEXTURE0');
  const bound = new Map<number, unknown>();
  const attached = new Map<unknown, unknown>();
  const out: { writes: unknown; src: unknown; unit1: unknown }[] = [];
  for (const [name, a] of log) {
    if (name === 'bindFramebuffer') fbo = a[1];
    if (name === 'activeTexture') unit = a[0] as number;
    if (name === 'bindTexture' && a[0] === k('TEXTURE_2D')) bound.set(unit, a[1]);
    if (name === 'framebufferTexture2D') attached.set(fbo, a[3]);
    if (name === 'drawArrays') out.push({ writes: attached.get(fbo), src: bound.get(k('TEXTURE0')), unit1: bound.get(k('TEXTURE1')) });
  }
  return out;
}

describe('a multi-pass effect reading its input', () => {
  it('never writes its input, gets it on u_input with its uv rows, and uses a third target only when needed', () => {
    register('invert', ok);
    register('glow', {
      ...ok,
      run: (pass) => { pass.draw({ u_a: 1 }); pass.draw({ u_a: 2 }); pass.draw({ u_a: 3 }, { input: true }); },
    });
    const { gl, log, k } = fakeGl();
    const pipeline = new EffectPipeline(gl);
    const src = input();
    // Alone: input is the external slot; three passes A, B, A — two targets suffice.
    pipeline.run(src, { width: 8, height: 8 }, IDENTITY, [fx('glow')], ctx());
    expect(pipeline.memory()).toEqual({ targets: 2, bytes: 2 * 8 * 8 * 4 });
    // After a one-pass effect, glow's input lives in target A: its passes write B, the scratch, then B.
    const out = pipeline.run(src, { width: 8, height: 8 }, [0, 1, 0, 1, 0, 0, 0, 0, 1], [fx('invert'), fx('glow')], ctx());
    const d = draws(log, k).slice(3);
    expect(d).toHaveLength(4);
    const glowInput = d[0].writes;
    for (const pass of d.slice(1)) expect(pass.writes).not.toBe(glowInput);
    expect(d[3].unit1).toBe(glowInput);
    expect(new Set(d.slice(1).map((p) => p.writes)).size).toBe(2);
    expect(out.tex).toBe(d[3].writes);
    expect(pipeline.memory()).toEqual({ targets: 3, bytes: 3 * 8 * 8 * 4 });
    pipeline.dispose();
    expect(pipeline.memory()).toEqual({ targets: 0, bytes: 0 });
  });

  it('passes the identity rows of a working-target input', () => {
    register('invert', ok);
    register('sharpen', { ...ok, run: (pass) => { pass.draw({}); pass.draw({}, { input: true }); } });
    const rows: number[][] = [];
    const { gl } = fakeGl({ uniform3fv: (_l, v) => void rows.push([...(v as number[])]) });
    new EffectPipeline(gl).run(input(), { width: 8, height: 8 }, IDENTITY, [fx('invert'), fx('sharpen')], ctx());
    expect(rows).toEqual([[1, 0, 0], [0, 1, 0]]);
  });

  it('a failure in a later pass rolls back to the untouched input', () => {
    register('invert', ok);
    register('glow', { ...ok, run: (pass) => { pass.draw({}); pass.draw({}); throw new Error('half way'); } });
    const { gl, log, k } = fakeGl();
    const pipeline = new EffectPipeline(gl);
    const out = pipeline.run(input(), { width: 8, height: 8 }, IDENTITY, [fx('invert'), fx('glow')], ctx());
    const d = draws(log, k);
    expect(out.tex).toBe(d[0].writes);
    for (const pass of d.slice(1)) expect(pass.writes).not.toBe(out.tex);
  });

  it('a stack of eight multi-pass effects stays within three targets of one size', () => {
    register('blur', { ...ok, run: (pass) => { pass.draw({}); pass.draw({}); } });
    const { gl } = fakeGl();
    const pipeline = new EffectPipeline(gl);
    pipeline.run(input(), { width: 8, height: 4 }, IDENTITY, Array.from({ length: 8 }, () => fx('blur')), ctx());
    expect(pipeline.passes).toBe(16);
    expect(pipeline.memory()).toEqual({ targets: 3, bytes: 3 * 8 * 4 * 4 });
  });
});

describe('uniformCall', () => {
  it('sets a Float32Array as a float array', () => {
    const a = new Float32Array([1, 2, 3, 4, 5]);
    expect(uniformCall(a)).toEqual(['uniform1fv', a]);
    expect(() => uniformCall([1, 2, 3, 4, 5])).toThrow();
  });
});
