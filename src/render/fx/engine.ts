// Runs each clip's effect stack on pooled targets between "gather" and "composite" (Plan 4 E1-E3, E6, E11).
import { clampFxParams } from '../../fx/params';
import type { Clip, FxType, Project } from '../../core/model';
import type { Draw } from '../frameSources';
import { fullscreenMatrix, letterbox, uvMatrix } from '../gl';
import type { QuadRenderer, Size } from '../gl';
import { GlUnavailableError } from '../glErrors';
import { LutTextures } from './lutTexture';
import { FullscreenPass, FxPrograms } from './pass';
import { TargetPool } from './pool';
import type { Target } from './pool';
import { EFFECT_DEFS } from './registry';
import { seedFor } from './seed';
import { FxRunContext } from './types';

const MAX_TARGET_SIDE = 4096;
const MIN_TARGET_SIDE = 8;
/** Framebuffer textures are stored bottom row first (see pool.ts). */
const FLIPPED = uvMatrix(0, true);

export type FxErrorHandler = (type: FxType, log: string) => void;

/** Target size for a clip: its on-screen size, never above the source nor 4096, at least 8 (E2). */
export function targetSize(src: Size, clipScale: number, screenScale: number): Size {
  const fit = (side: number): number => {
    const cap = Math.max(1, Math.min(Math.ceil(side), MAX_TARGET_SIDE));
    return Math.min(cap, Math.max(MIN_TARGET_SIDE, Math.ceil(side * clipScale * screenScale)));
  };
  return { width: fit(src.width), height: fit(src.height) };
}

export class FxEngine {
  private readonly pool: TargetPool;
  private readonly pass: FullscreenPass;
  private readonly programs: FxPrograms;
  private readonly luts: LutTextures;
  private readonly failed = new Set<FxType>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly quad: QuadRenderer,
    private readonly onError?: FxErrorHandler,
  ) {
    this.pool = new TargetPool(gl);
    this.pass = new FullscreenPass(gl);
    this.programs = new FxPrograms(gl);
    this.luts = new LutTextures(gl);
  }

  lutCount(): number {
    return this.luts.count;
  }

  /** Loads the LUTs the visible clips use (async); call before `process`. Never rejects. */
  async prepare(draws: Draw[]): Promise<void> {
    const refs: string[] = [];
    for (const d of draws) for (const e of d.clip.fx) if (e.enabled && e.type === 'lut' && e.ref) refs.push(e.ref);
    if (refs.length) await this.luts.ensure(refs);
  }

  targetCount(): number {
    return this.pool.stats().total;
  }

  /** Whether the clip has an effect that will actually run (otherwise it takes the plain draw path, E3). */
  active(clip: Clip): boolean {
    return clip.fx.some((e) => e.enabled && EFFECT_DEFS[e.type].available && !this.failed.has(e.type));
  }

  /** Replaces the draws of effected clips by their processed targets; call `release(targets)` after compositing. */
  process(draws: Draw[], p: Project, t: number, canvas: Size): { draws: Draw[]; targets: Target[] } {
    const format: Size = { width: p.format.width, height: p.format.height };
    const screenScale = letterbox(format, canvas).width / format.width;
    const targets: Target[] = [];
    const out = draws.map((d) => {
      if (!this.active(d.clip)) return d;
      const target = this.run(d, p, t, screenScale);
      targets.push(target);
      return { ...d, slot: target.slot, uv: FLIPPED };
    });
    return { draws: out, targets };
  }

  release(targets: Target[]): void {
    for (const t of targets) this.pool.release(t);
    this.pool.endFrame();
  }

  dispose(): void {
    this.pool.dispose();
    this.programs.dispose();
    this.luts.dispose();
    this.pass.dispose();
  }

  private run(d: Draw, p: Project, t: number, screenScale: number): Target {
    const gl = this.gl;
    const { width, height } = targetSize(d.size, d.clip.transform.scale, screenScale);
    let cur = this.pool.acquire(width, height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, cur.fbo);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.quad.draw(d.slot.tex, fullscreenMatrix(), 1, d.uv);
    const time = t - d.clip.start;
    const frame = Math.floor(time * p.format.fps + 1e-6);
    const rc = new FxRunContext(gl, this.pool, this.pass, this.programs, this.luts, {
      pxScale: width / d.size.width, time, frame, seed: seedFor(frame, d.clip.id), fps: p.format.fps, clipId: d.clip.id,
    });
    for (const e of d.clip.fx) {
      const def = EFFECT_DEFS[e.type];
      if (!e.enabled || !def.available || this.failed.has(e.type)) continue;
      try {
        cur = def.run(rc, cur, clampFxParams(e.type, e.params), e);
      } catch (err) {
        if (!(err instanceof GlUnavailableError) || err.reason !== 'shader') throw err;
        this.failed.add(e.type);
        this.onError?.(e.type, err.log ?? err.message);
      }
    }
    return cur;
  }
}
