// GL resources of the effect passes: ping-pong targets (plus a scratch) pooled by size, and the fullscreen unit quad.
import type { Size } from '../geometry';
import { GlUnavailableError } from '../glErrors';
import { RenderTarget } from '../renderTarget';
import { assertNotLost } from './programs';

export type TargetPair = [RenderTarget, RenderTarget];

interface PoolEntry {
  pair: TargetPair;
  /** The third target, created only when a multi-pass effect needs it (see `target`). */
  scratch?: RenderTarget;
}

/**
 * Effect targets keyed by working size: a ping-pong pair per size plus, on demand, a scratch target; the least
 * recently used size is evicted beyond `max` (default 3). Memory bound: ≤ 3 RGBA8 targets per size, ≤ `max` sizes,
 * so at most 3 × max × (working width × height × 4) bytes, the working size being capped at 2× the format's long
 * side and MAX_TEXTURE_SIZE (pipeline.ts workingSize).
 */
export class TargetPool {
  private readonly entries = new Map<string, PoolEntry>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly max = 3,
  ) {}

  /**
   * A target of `size` whose texture is none of `avoid` (the source a pass samples and the effect's input): the
   * first of the pair that qualifies, else the scratch target (created on first need). Each target reallocates only
   * when first bound at that size. With two distinct textures to avoid there is always one left.
   */
  target(size: Size, avoid: readonly WebGLTexture[]): RenderTarget {
    const entry = this.entry(size);
    for (const t of entry.pair) if (!avoid.includes(t.slot.tex)) return t;
    if (!entry.scratch) {
      try {
        entry.scratch = new RenderTarget(this.gl);
      } catch (e) {
        assertNotLost(this.gl);
        throw e;
      }
    }
    return entry.scratch;
  }

  /** Allocated GL targets and their texture bytes (RGBA8), for tests and the memory bound. */
  stats(): { targets: number; bytes: number } {
    let targets = 0;
    let bytes = 0;
    for (const t of [...this.entries.values()].flatMap(all)) {
      targets++;
      bytes += t.slot.width * t.slot.height * 4;
    }
    return { targets, bytes };
  }

  dispose(): void {
    for (const e of this.entries.values()) for (const t of all(e)) t.dispose();
    this.entries.clear();
  }

  private entry(size: Size): PoolEntry {
    const key = `${size.width}x${size.height}`;
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
      return hit;
    }
    const entry = { pair: this.create() };
    this.entries.set(key, entry);
    for (const [k, old] of this.entries) {
      if (this.entries.size <= this.max) break;
      for (const t of all(old)) t.dispose();
      this.entries.delete(k);
    }
    return entry;
  }

  private create(): TargetPair {
    let a: RenderTarget | null = null;
    try {
      a = new RenderTarget(this.gl);
      return [a, new RenderTarget(this.gl)];
    } catch (e) {
      a?.dispose();
      assertNotLost(this.gl);
      throw e;
    }
  }
}

const all = (e: PoolEntry): RenderTarget[] => (e.scratch ? [...e.pair, e.scratch] : [...e.pair]);

/** A VAO over the unit square [0, 1]² as a triangle strip, attribute location 0 (see PASS_VERTEX). */
export function createUnitQuad(gl: WebGL2RenderingContext): { vao: WebGLVertexArrayObject; buffer: WebGLBuffer } {
  const vao = gl.createVertexArray() as WebGLVertexArrayObject | null;
  const buffer = gl.createBuffer() as WebGLBuffer | null;
  if (!vao || !buffer) {
    if (vao) gl.deleteVertexArray(vao);
    if (buffer) gl.deleteBuffer(buffer);
    assertNotLost(gl);
    throw new GlUnavailableError('resource', 'Could not create the effect quad');
  }
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  gl.bindVertexArray(null);
  return { vao, buffer };
}
