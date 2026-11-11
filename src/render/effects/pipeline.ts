// Runs a clip's effect stack as fullscreen passes over ping-pong targets, before the clip's transformed draw (D2).
import type { VideoEffect } from '../../core/model';
import type { Mat3, Size } from '../geometry';
import type { TextureSlot } from '../gl';
import { GlUnavailableError } from '../glErrors';
import { RenderTarget } from '../renderTarget';
import { disposePrograms, programFor, PASS_SHADERS } from './programs';
import type { PassProgram } from './programs';
import type { EffectContext, Uniforms } from './types';

const IDENTITY: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** `size` scaled down (aspect kept) so its long side is at most `cap`; integer, never empty, never upscaled. */
export function capLongSide(size: Size, cap: number): Size {
  const scale = Math.min(1, cap / Math.max(size.width, size.height));
  return {
    width: Math.max(1, Math.round(size.width * scale)),
    height: Math.max(1, Math.round(size.height * scale)),
  };
}

/** The effect working size: the clip's displayed source size, capped at 2x the format's long side (D2). */
export function workingSize(display: Size, format: Size): Size {
  return capLongSide(display, 2 * Math.max(format.width, format.height));
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

interface SavedState {
  framebuffer: WebGLFramebuffer | null;
  viewport: Int32Array;
  blend: boolean;
  activeTexture: number;
}

export class EffectPipeline {
  /** Fullscreen passes drawn since creation (instrumentation for tests). */
  passes = 0;
  private targets: [RenderTarget, RenderTarget] | null = null;
  private vao: WebGLVertexArrayObject | null = null;
  private buffer: WebGLBuffer | null = null;
  private maxSide = 0;

  /** GL objects are created on first use, so a project without effects never allocates (or calls GL) here. */
  constructor(private readonly gl: WebGL2RenderingContext) {}

  /**
   * Applies the enabled effects that have a working program to `input` (shown through `uv`) at `size` (the working
   * size, see workingSize). Returns `input` itself, with no GL call, when nothing applies; otherwise a target slot
   * whose texture holds the result premultiplied, upright and top row first (draw it with an identity uv). GL state
   * it changes (framebuffer, viewport, blend, active texture) is restored.
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
    const saved = this.save();
    try {
      const targets = this.ensure();
      const work = this.clampToGpu(size);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(this.vao);
      let out = input;
      let srcUv = uv;
      let n = 0;
      for (const [effect, program] of steps) {
        const pass = (uniforms: Uniforms): void => {
          const target = targets[n++ % 2];
          target.bind(work.width, work.height);
          program.draw(out.tex, srcUv, uniforms, work, ctx);
          target.slot.mipmapped = false;
          out = target.slot;
          srcUv = IDENTITY;
          this.passes++;
        };
        const { shader } = program;
        if (shader.run) shader.run({ draw: pass }, effect.params, ctx, work);
        else pass(shader.uniforms(effect.params, ctx, work));
      }
      return out;
    } finally {
      this.restore(saved);
    }
  }

  dispose(): void {
    const gl = this.gl;
    for (const t of this.targets ?? []) t.dispose();
    this.targets = null;
    if (this.vao) gl.deleteVertexArray(this.vao);
    if (this.buffer) gl.deleteBuffer(this.buffer);
    this.vao = null;
    this.buffer = null;
    disposePrograms(gl);
  }

  private clampToGpu(size: Size): Size {
    if (!this.maxSide) this.maxSide = Number(this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE)) || 4096;
    return capLongSide(size, this.maxSide);
  }

  private ensure(): [RenderTarget, RenderTarget] {
    const gl = this.gl;
    if (!this.vao) {
      const vao = gl.createVertexArray() as WebGLVertexArrayObject | null;
      const buffer = gl.createBuffer() as WebGLBuffer | null;
      if (!vao || !buffer) {
        if (vao) gl.deleteVertexArray(vao);
        if (buffer) gl.deleteBuffer(buffer);
        throw new GlUnavailableError('resource', 'Could not create the effect quad');
      }
      gl.bindVertexArray(vao);
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      gl.bindVertexArray(null);
      this.vao = vao;
      this.buffer = buffer;
    }
    if (!this.targets) {
      const a = new RenderTarget(this.gl);
      try {
        this.targets = [a, new RenderTarget(this.gl)];
      } catch (e) {
        a.dispose();
        throw e;
      }
    }
    return this.targets;
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
