// The PassShader `inputs` hook (Plan 4 Task 6): extra textures bound to units 1.., and skipping when an input is missing.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { EffectPipeline } from '../src/render/effects/pipeline';
import { registerPassShader } from '../src/render/effects/programs';
import type { EffectContext, PassShader } from '../src/render/effects/types';
import type { VideoEffect } from '../src/core/model';
import type { Mat3, TextureSlot } from '../src/render/gl';
import { LUT } from '../src/render/effects/shaders/lut';
import { fakeGl } from './fake-gl';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];
const SIZE = { width: 8, height: 8 };
const input = (): TextureSlot => ({ tex: { kind: 'input' } as unknown as WebGLTexture, width: 8, height: 8 });
const lutTex = { kind: 'lut3d' } as unknown as WebGLTexture;
const fx = (ref?: string): VideoEffect => ({ id: 'e', type: 'lut', enabled: true, params: { intensity: 0.5 }, ref });
const ctx = (lut: EffectContext['lut'], onUnavailable = vi.fn()): EffectContext => ({ time: 0, frame: 0, fps: 30, lut, onUnavailable });
const loaded = { texture: lutTex, size: 17, domainMin: [0, 0, 0] as [number, number, number], domainMax: [2, 2, 2] as [number, number, number] };

afterEach(() => registerPassShader('lut', LUT));

describe('PassShader.inputs', () => {
  it('binds each extra texture to unit 1.. with its sampler uniform, then unbinds it and re-selects unit 0', () => {
    const { gl, log, k } = fakeGl();
    const shader: PassShader = {
      fragment: 'two',
      uniforms: () => ({ u_a: 1 }),
      inputs: () => ({ textures: { u_lut: { target: 'TEXTURE_3D', texture: lutTex } }, uniforms: { u_b: [1, 2, 3] } }),
    };
    registerPassShader('lut', shader);
    const out = new EffectPipeline(gl).run(input(), SIZE, IDENTITY, [fx('L')], ctx(() => loaded));
    expect(out).not.toBe(input());
    const names = log.map(([n]) => n);
    const draw = names.indexOf('drawArrays');
    const bind3d = log.findIndex(([n, a]) => n === 'bindTexture' && a[0] === k('TEXTURE_3D') && a[1] === lutTex);
    expect(bind3d).toBeGreaterThan(-1);
    expect(bind3d).toBeLessThan(draw);
    // Unit 1 was active when the LUT was bound, and the sampler was set to 1.
    const active = log.slice(0, bind3d).filter(([n]) => n === 'activeTexture').pop();
    expect(active?.[1][0]).toBe(k('TEXTURE1'));
    expect(log.some(([n, a]) => n === 'uniform1i' && a[1] === 1)).toBe(true);
    expect(log.some(([n, a]) => n === 'uniform3fv' && JSON.stringify(a[1]) === '[1,2,3]')).toBe(true);
    // After the draw: the 3D unit is unbound and unit 0 is active again.
    const after = log.slice(draw);
    const unbind = after.findIndex(([n, a]) => n === 'bindTexture' && a[0] === k('TEXTURE_3D') && a[1] === null);
    expect(unbind).toBeGreaterThan(-1);
    expect(after[unbind + 1]).toEqual(['activeTexture', [k('TEXTURE0')]]);
  });

  it('a null input skips the effect this frame: no pass, the input slot itself, not marked unavailable', () => {
    const { gl, count } = fakeGl();
    const onUnavailable = vi.fn();
    const src = input();
    const pipeline = new EffectPipeline(gl);
    expect(pipeline.run(src, SIZE, IDENTITY, [fx('L')], ctx(() => null, onUnavailable))).toBe(src);
    expect(pipeline.run(src, SIZE, IDENTITY, [fx(undefined)], ctx(() => loaded, onUnavailable))).toBe(src);
    expect(count('drawArrays')).toBe(0);
    expect(pipeline.passes).toBe(0);
    expect(onUnavailable).not.toHaveBeenCalled();
    // Once the LUT is there, the same effect draws.
    expect(pipeline.run(src, SIZE, IDENTITY, [fx('L')], ctx(() => loaded, onUnavailable))).not.toBe(src);
    expect(pipeline.passes).toBe(1);
  });
});

describe('the LUT shader', () => {
  it('declares its sampler and the domain/intensity uniforms the hooks supply', () => {
    expect(LUT.fragment).toMatch(/uniform highp sampler3D u_lut;/);
    expect(LUT.uniforms({ intensity: 0.25 }, ctx(() => null), SIZE)).toEqual({ u_intensity: 0.25 });
    expect(LUT.inputs!(fx('L'), ctx(() => loaded))).toEqual({
      textures: { u_lut: { target: 'TEXTURE_3D', texture: lutTex } },
      uniforms: { u_dmin: [0, 0, 0], u_dscale: [0.5, 0.5, 0.5] },
    });
    expect(LUT.inputs!(fx(undefined), ctx(() => loaded))).toBeNull();
    expect(LUT.inputs!(fx('L'), ctx(() => null))).toBeNull();
  });
});
