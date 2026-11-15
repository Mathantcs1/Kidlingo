import type { FxType, VisualEffect } from '../../core/model';
import { fragment } from './glsl';
import { FullscreenPass, FxPrograms } from './pass';
import type { FxProgram, Uniforms } from './pass';
import type { LutTextures } from './lutTexture';
import { TargetPool } from './pool';
import type { Target } from './pool';

/** What an effect needs to run: GL helpers plus the clip's timing (Plan 4 E2: pxScale; E6: frame and seed). */
export class FxRunContext {
  constructor(
    readonly gl: WebGL2RenderingContext,
    readonly pool: TargetPool,
    readonly pass: FullscreenPass,
    readonly programs: FxPrograms,
    readonly luts: LutTextures,
    readonly info: { pxScale: number; time: number; frame: number; seed: number; fps: number; clipId: string },
  ) {}

  /** Compiles (once) the shader for `key`; call BEFORE acquiring any target so a compile failure leaks nothing. */
  program(key: string, chunks: string[], body: string): FxProgram {
    return this.programs.get(key, () => fragment(key, chunks, body));
  }

  /** One pass `src` → a fresh target of the same size; releases `src` and returns the new target. */
  onePass(prog: FxProgram, src: Target, uniforms: Uniforms): Target {
    const dst = this.pool.acquire(src.width, src.height);
    this.pass.draw(prog, src, dst, uniforms);
    this.pool.release(src);
    return dst;
  }
}

export interface FxDef {
  type: FxType;
  /** False for entries whose shader is not built yet: they are skipped and never count as an active effect. */
  available: boolean;
  /** Returns the target holding the result (releasing whatever it replaced). `params` are already clamped. */
  run(rc: FxRunContext, src: Target, params: Record<string, number>, fx: VisualEffect): Target;
}

/** `{ amount: 1 }` → `{ u_amount: 1 }` */
export function paramUniforms(params: Record<string, number>): Uniforms {
  return Object.fromEntries(Object.entries(params).map(([k, v]) => [`u_${k}`, v]));
}
