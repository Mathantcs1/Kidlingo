import { describe, expect, it } from 'vitest';
import { GLITCH, INVERT, MIRROR, RGB_SPLIT, VHS_SHADER } from '../src/render/effects/shaders/stylise';
import { PASS_SHADERS } from '../src/render/effects/programs';
import { defaultParams } from '../src/core/videoEffects';
import type { EffectContext, PassShader, Uniforms } from '../src/render/effects/types';
import type { VideoEffectType } from '../src/core/model';

const ctx: EffectContext = { time: 0.5, frame: 15, fps: 30, lut: () => null, onUnavailable: () => {} };
const size = { width: 64, height: 540 };
const SHADERS: [VideoEffectType, PassShader, Record<string, number>][] = [
  ['invert', INVERT, { amount: 0 }],
  ['mirror', MIRROR, {}],
  ['rgbSplit', RGB_SPLIT, { amount: 0 }],
  ['glitch', GLITCH, { intensity: 0 }],
  ['vhs', VHS_SHADER, { scanlines: 0, bleed: 0, noise: 0, wobble: 0 }],
];

/** The uniforms of each pass `shader` draws for `params`. */
function passes(shader: PassShader, params: Record<string, number>): Uniforms[] {
  const out: Uniforms[] = [];
  if (!shader.run) return [shader.uniforms(params, ctx, size)];
  shader.run({ draw: (u) => { out.push(u); } }, params, ctx, size);
  return out;
}

describe('stylise shaders', () => {
  for (const [type, shader, identity] of SHADERS) {
    it(`${type}: registered, one pass at the defaults with only declared float/vec uniforms, no pass at the identity`, () => {
      expect(PASS_SHADERS[type]).toBe(shader);
      const drawn = passes(shader, defaultParams(type));
      expect(drawn).toHaveLength(1);
      const kinds: Record<string, number> = { float: 1, vec2: 2, vec3: 3, vec4: 4 };
      for (const [name, value] of Object.entries(drawn[0])) {
        const decl = new RegExp(`uniform (float|vec[234]) ${name};`).exec(shader.fragment);
        expect(decl, `${type} declares ${name}`).not.toBeNull();
        const len = typeof value === 'number' ? 1 : value.length;
        expect(len, `${type} ${name}`).toBe(kinds[decl![1]]);
        for (const v of typeof value === 'number' ? [value] : value) expect(Number.isFinite(v)).toBe(true);
      }
      if (type !== 'mirror') expect(passes(shader, { ...defaultParams(type), ...identity })).toEqual([]);
    });
  }

  it('the time-based shaders read the frame index; the size-like scales are uniforms (no GLSL referenceScale)', () => {
    for (const s of [GLITCH, VHS_SHADER]) {
      expect(s.fragment).toContain('uniform float u_frame;');
      expect(s.fragment).not.toMatch(/1080/);
    }
  });
});
