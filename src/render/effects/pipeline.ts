// Runs a clip's effect stack as fullscreen passes over ping-pong targets, before the clip's transformed draw (D2).
import type { VideoEffect, VideoEffectType } from '../../core/model';
import type { Mat3, Size } from '../geometry';
import type { TextureSlot } from '../gl';
import { cappedSize } from '../images';
import { TargetPool, createUnitQuad } from './passResources';
import { CONTEXT_LOST, PASS_SHADERS, assertNotLost, disposePrograms, markUnavailable, programFor } from './programs';
import type { PassProgram } from './programs';
import type { EffectContext, PassInputs, PassOptions, PassTexture, Uniforms } from './types';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** The effect working size: the clip's displayed source size, capped at 2x the format's long side (D2). */
export function workingSize(display: Size, format: Size): Size {
  return cappedSize(display, 2 * Math.max(format.width, format.height));
}

/**
 * The working size of a draw whose texture holds `texels` (its resolution in DISPLAY orientation, e.g. an image
 * decoded at a capped size): the display size scaled down to no more texels than there are, then workingSize.
 */
export function effectWorkingSize(display: Size, texels: Size, format: Size): Size {
  return workingSize(cappedSize(display, Math.max(texels.width, texels.height)), format);
}

/**
 * The frame index of clip-relative time `t`: floor(t·fps), with a 1e-6 frame tolerance so t = N / fps (as computed
 * by the exporter or the playhead) is frame N despite floating-point error. 0 for t < 0, non-finite t or fps ≤ 0.
 */
export function frameIndex(t: number, fps: number): number {
  if (!Number.isFinite(t) || !Number.isFinite(fps) || fps <= 0 || t <= 0) return 0;
  return Math.floor(t * fps + 1e-6);
}

/** Clip-relative time snapped to its frame's start: frameIndex(t, fps) / fps (D6: preview frame N = export frame N). */
export function snapToFrame(t: number, fps: number): number {
  const n = frameIndex(t, fps);
  return n === 0 ? 0 : n / fps;
}

/** The rows of a uv matrix (column-major mat3) as the u_inputX / u_inputY uniforms of PassOptions.input. */
function inputRows(m: Mat3): Uniforms {
  return { u_inputX: [m[0], m[3], m[6]], u_inputY: [m[1], m[4], m[7]] };
}

interface SavedState {
  framebuffer: WebGLFramebuffer | null;
  viewport: Int32Array;
  blend: boolean;
  activeTexture: number;
}

export class EffectPipeline {
  /** Fullscreen passes drawn since creation (instrumentation for tests). */
  passes = 0;
  private readonly pool: TargetPool;
  private quad: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer } | null = null;
  private maxSide = 0;

  /** GL objects are created on first use, so a project without effects never allocates (or calls GL) here. */
  constructor(private readonly gl: WebGL2RenderingContext) {
    this.pool = new TargetPool(gl);
  }

  /**
   * Applies the enabled effects that have a working program to `input` (shown through `uv`) at `size` (the working
   * size, see effectWorkingSize). Returns `input` itself, with no GL call, when nothing applies; otherwise a target
   * slot whose texture holds the result premultiplied, upright and top row first (draw it with an identity uv). GL
   * state it changes (framebuffer, viewport, blend, active texture) is restored. An effect that throws is turned off
   * for the session and skipped (D8); a lost context throws Error('WebGL context lost').
   */
  run(input: TextureSlot, size: Size, uv: Mat3, effects: readonly VideoEffect[] | undefined, ctx: EffectContext): TextureSlot {
    if (!effects || effects.length === 0) return input;
    const steps: [VideoEffect, PassProgram][] = [];
    for (const e of effects) {
      if (!e.enabled || !Object.hasOwn(PASS_SHADERS, e.type)) continue;
      const program = programFor(this.gl, e.type, ctx.onUnavailable);
      if (program) steps.push([e, program]);
    }
    if (steps.length === 0) return input;

    const gl = this.gl;
    assertNotLost(gl);
    const saved = this.save();
    try {
      const work = this.clampToGpu(size);
      this.quad ??= createUnitQuad(gl);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(this.quad.vao);
      let out = input;
      let srcUv = uv;
      for (const [effect, program] of steps) {
        // The effect's input is never written during its passes (pool.target), so a failure rolls back to it and
        // PassOptions.input can read it in any pass.
        const before = { out, srcUv };
        let inputs: PassInputs | null = { textures: {} };
        const pass = (uniforms: Uniforms, opts?: PassOptions): void => {
          const target = this.pool.target(work, [out.tex, before.out.tex]);
          target.bind(work.width, work.height);
          let textures: Record<string, PassTexture> | undefined = inputs?.textures;
          let all: Uniforms = { ...uniforms, ...inputs?.uniforms };
          if (opts?.input) {
            textures = { ...textures, u_input: { target: 'TEXTURE_2D', texture: before.out.tex } };
            all = { ...all, ...inputRows(before.srcUv) };
          }
          program.draw(out.tex, srcUv, all, work, ctx, textures);
          target.slot.mipmapped = false;
          out = target.slot;
          srcUv = IDENTITY;
          this.passes++;
        };
        try {
          const { shader } = program;
          // A missing input (e.g. a LUT that could not be loaded) skips the effect this frame; it stays available.
          if (shader.inputs) inputs = shader.inputs(effect, ctx);
          if (!inputs) continue;
          if (shader.run) shader.run({ draw: pass }, effect.params, ctx, work);
          else pass(shader.uniforms(effect.params, ctx, work));
        } catch (e) {
          this.contain(effect.type, program, ctx, e);
          ({ out, srcUv } = before);
        }
      }
      // A loss mid-stack makes every later GL call a no-op: the result is garbage, so report it.
      assertNotLost(gl);
      return out;
    } finally {
      // On a lost context getParameter returned nulls: there is nothing to restore, and the error must not be masked.
      if (!gl.isContextLost()) this.restore(saved);
    }
  }

  /** The effect targets currently allocated and their bytes (see TargetPool for the bound). */
  memory(): { targets: number; bytes: number } {
    return this.pool.stats();
  }

  dispose(): void {
    const gl = this.gl;
    this.pool.dispose();
    if (this.quad) {
      gl.deleteVertexArray(this.quad.vao);
      gl.deleteBuffer(this.quad.buffer);
      this.quad = null;
    }
    disposePrograms(gl);
  }

  /** A failed effect step: lost context propagates; anything else turns the type off for the session. */
  private contain(type: VideoEffectType, program: PassProgram, ctx: EffectContext, e: unknown): void {
    if (this.gl.isContextLost() || (e instanceof Error && e.message === CONTEXT_LOST)) throw new Error(CONTEXT_LOST);
    markUnavailable(type, program.shader, ctx.onUnavailable, e);
  }

  private clampToGpu(size: Size): Size {
    if (!this.maxSide) this.maxSide = Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)) || 4096;
    return cappedSize(size, this.maxSide);
  }

  private save(): SavedState {
    const gl = this.gl;
    return {
      framebuffer: gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
      viewport: gl.getParameter(gl.VIEWPORT) as Int32Array,
      blend: gl.isEnabled(gl.BLEND),
      activeTexture: gl.getParameter(gl.ACTIVE_TEXTURE) as number,
    };
  }

  private restore(s: SavedState): void {
    const gl = this.gl;
    gl.bindVertexArray(null);
    gl.bindFramebuffer(gl.FRAMEBUFFER, s.framebuffer);
    gl.viewport(s.viewport[0], s.viewport[1], s.viewport[2], s.viewport[3]);
    if (s.blend) gl.enable(gl.BLEND);
    else gl.disable(gl.BLEND);
    gl.activeTexture(s.activeTexture);
  }
}
