import { describe, expect, it, vi } from 'vitest';
import { EffectPipeline, capLongSide, frameIndex, snapToFrame, workingSize } from '../src/render/effects/pipeline';
import { PASS_SHADERS, programFor, registerPassShader, uniformCall } from '../src/render/effects/programs';
import type { EffectContext, PassShader } from '../src/render/effects/types';
import type { VideoEffect } from '../src/core/model';
import type { TextureSlot } from '../src/render/gl';

const fmt1080 = { width: 1920, height: 1080 };

describe('workingSize', () => {
  it('keeps a 1080p source in a 1080p format as is', () => {
    expect(workingSize({ width: 1920, height: 1080 }, fmt1080)).toEqual({ width: 1920, height: 1080 });
  });
  it('keeps a 4K source in a 1080p format (exactly 2x the long side)', () => {
    expect(workingSize({ width: 3840, height: 2160 }, fmt1080)).toEqual({ width: 3840, height: 2160 });
  });
  it('caps a 4K source in a 720p format at 2x the long side, aspect preserved', () => {
    expect(workingSize({ width: 3840, height: 2160 }, { width: 1280, height: 720 })).toEqual({ width: 2560, height: 1440 });
  });
  it('caps a portrait source by its long side against the format long side', () => {
    expect(workingSize({ width: 2160, height: 3840 }, { width: 1280, height: 720 })).toEqual({ width: 1440, height: 2560 });
    expect(workingSize({ width: 1080, height: 1920 }, { width: 1080, height: 1920 })).toEqual({ width: 1080, height: 1920 });
  });
  it('keeps a 1x1 source at 1x1 (never upscales, never empty)', () => {
    expect(workingSize({ width: 1, height: 1 }, fmt1080)).toEqual({ width: 1, height: 1 });
  });
  it('caps a tall 100x4000 source to 96x3840 and never returns an empty side', () => {
    expect(workingSize({ width: 100, height: 4000 }, fmt1080)).toEqual({ width: 96, height: 3840 });
    expect(workingSize({ width: 1, height: 100000 }, fmt1080)).toEqual({ width: 1, height: 3840 });
  });
  it('returns integers for fractional sizes', () => {
    const s = workingSize({ width: 333.3, height: 99.6 }, fmt1080);
    expect(s).toEqual({ width: 333, height: 100 });
  });
  it('capLongSide also honours a GPU texture limit', () => {
    expect(capLongSide({ width: 8000, height: 4000 }, 4096)).toEqual({ width: 4096, height: 2048 });
    expect(capLongSide({ width: 100, height: 50 }, 4096)).toEqual({ width: 100, height: 50 });
  });
});

describe('snapToFrame', () => {
  it('floors to the frame start', () => {
    expect(snapToFrame(0, 30)).toBe(0);
    expect(snapToFrame(1 / 30 - 1e-3, 30)).toBe(0);
    expect(snapToFrame(0.05, 30)).toBe(1 / 30);
    expect(snapToFrame(2.5, 24)).toBe(60 / 24);
  });
  it('lands on frame N for t = N / fps despite floating point error', () => {
    for (const fps of [24, 25, 29.97, 30, 60]) {
      for (let n = 0; n < 400; n++) {
        expect(frameIndex(n / fps, fps)).toBe(n);
        expect(snapToFrame(n / fps, fps)).toBe(n / fps);
      }
    }
    expect(frameIndex(0.7, 30)).toBe(21);
  });
  it('is 0 before the clip, for non-finite input or a bad fps', () => {
    expect(snapToFrame(-0.5, 30)).toBe(0);
    expect(snapToFrame(Number.NaN, 30)).toBe(0);
    expect(snapToFrame(1, 0)).toBe(0);
    expect(frameIndex(Infinity, 30)).toBe(0);
  });
});

describe('uniformCall', () => {
  it('maps numbers and vectors to the right uniform setter', () => {
    expect(uniformCall(0.5)).toEqual(['uniform1f', 0.5]);
    expect(uniformCall([1, 2])).toEqual(['uniform2fv', [1, 2]]);
    expect(uniformCall([1, 2, 3])).toEqual(['uniform3fv', [1, 2, 3]]);
    expect(uniformCall([1, 2, 3, 4])).toEqual(['uniform4fv', [1, 2, 3, 4]]);
    expect(() => uniformCall([1, 2, 3, 4, 5])).toThrow();
  });
});

/** A fake WebGL2 context: constants are numbers, every method call is recorded and answered by `answers`. */
function fakeGl(answers: Record<string, (...a: unknown[]) => unknown> = {}) {
  const calls: string[] = [];
  const gl = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (/^[A-Z0-9_]+$/.test(prop)) return prop.length;
      return (...a: unknown[]) => {
        calls.push(prop);
        if (answers[prop]) return answers[prop](...a);
        if (prop.startsWith('create')) return { kind: prop };
        if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return true;
        if (prop === 'isContextLost') return false;
        return null;
      };
    },
  });
  return { gl: gl as unknown as WebGL2RenderingContext, calls };
}

const ctx = (onUnavailable = vi.fn()): EffectContext => ({ time: 0, frame: 0, fps: 30, lut: () => null, onUnavailable });
const effect = (type: VideoEffect['type'], enabled = true): VideoEffect => ({ id: `e-${type}`, type, enabled, params: { amount: 1 } });
const slot = (): TextureSlot => ({ tex: {} as WebGLTexture, width: 8, height: 8 });
const IDENTITY = [1, 0, 0, 0, 1, 0, 0, 0, 1] as const;

describe('EffectPipeline.run with nothing to apply', () => {
  const shader: PassShader = { fragment: 'void main() {}', uniforms: () => ({}) };

  it('returns the SAME slot and makes no GL call for an empty, disabled or unregistered stack', () => {
    registerPassShader('invert', shader);
    try {
      const { gl, calls } = fakeGl();
      const pipeline = new EffectPipeline(gl);
      const input = slot();
      for (const stack of [[], [effect('invert', false)], [effect('sepia')], [effect('bw', false), effect('vhs')]]) {
        expect(pipeline.run(input, { width: 8, height: 8 }, [...IDENTITY], stack, ctx())).toBe(input);
      }
      expect(calls).toEqual([]);
      expect(pipeline.passes).toBe(0);
    } finally {
      registerPassShader('invert', undefined);
    }
  });

  it('nothing is registered by default yet (every effect still unavailable)', () => {
    expect(Object.keys(PASS_SHADERS)).toEqual([]);
  });
});

describe('programFor failure policy', () => {
  it('caches a compile failure: null, onUnavailable once, no recompile', () => {
    const broken: PassShader = { fragment: 'not glsl', uniforms: () => ({}) };
    registerPassShader('sepia', broken);
    try {
      const { gl, calls } = fakeGl({ getShaderParameter: () => false, getShaderInfoLog: () => 'bad' });
      const onUnavailable = vi.fn();
      expect(programFor(gl, 'sepia', onUnavailable)).toBeNull();
      const compiles = calls.filter((c) => c === 'compileShader').length;
      expect(compiles).toBeGreaterThan(0);
      expect(programFor(gl, 'sepia', onUnavailable)).toBeNull();
      // Another context (an export) does not retry or notify again: the type is off for the session.
      const other = fakeGl();
      expect(programFor(other.gl, 'sepia', onUnavailable)).toBeNull();
      expect(other.calls).toEqual([]);
      expect(calls.filter((c) => c === 'compileShader').length).toBe(compiles);
      expect(onUnavailable).toHaveBeenCalledTimes(1);
      expect(onUnavailable).toHaveBeenCalledWith('sepia');
    } finally {
      registerPassShader('sepia', undefined);
    }
  });

  it('a lost context is an error, not an unavailable effect (and is not cached)', () => {
    const fine: PassShader = { fragment: 'void main() {}', uniforms: () => ({}) };
    registerPassShader('bw', fine);
    try {
      const lost = fakeGl({ getShaderParameter: () => false, isContextLost: () => true });
      const onUnavailable = vi.fn();
      expect(() => programFor(lost.gl, 'bw', onUnavailable)).toThrow('WebGL context lost');
      expect(onUnavailable).not.toHaveBeenCalled();
      const { gl } = fakeGl();
      expect(programFor(gl, 'bw', onUnavailable)).not.toBeNull();
      // Compiled once per context.
      expect(programFor(gl, 'bw', onUnavailable)).toBe(programFor(gl, 'bw', onUnavailable));
    } finally {
      registerPassShader('bw', undefined);
    }
  });

  it('returns null without notifying for a type with no registered shader', () => {
    const { gl, calls } = fakeGl();
    const onUnavailable = vi.fn();
    expect(programFor(gl, 'glow', onUnavailable)).toBeNull();
    expect(onUnavailable).not.toHaveBeenCalled();
    expect(calls).toEqual([]);
  });
});
