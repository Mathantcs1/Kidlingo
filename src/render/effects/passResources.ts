// GL resources of the effect passes: ping-pong targets (plus a scratch) pooled by size, and the fullscreen unit quad.
import type { Size } from '../geometry';
import { GlUnavailableError } from '../glErrors';
import { RenderTarget } from '../renderTarget';
import { assertNotLost } from './programs';

export type TargetPair = [RenderTarget, RenderTarget];

interface PoolEntry {
  pair: TargetPair;
  /** Bytes of one target of this entry's size (width × height × 4). */
  bytes: number;
  /** The third target, created only when a multi-pass effect needs it (see `target`). */
  scratch?: RenderTarget;
}

/** The pool's byte budget: 640 MiB of RGBA8 effect targets (see TargetPool). */
export const POOL_BYTE_BUDGET = 640 * 1024 * 1024;

/**
 * Effect targets keyed by working size: a ping-pong pair per size plus, on demand, a scratch target. After every
 * `target` call the pool keeps at most `max` sizes (default 3, least recently used evicted) AND at most `budget` bytes
 * (default POOL_BYTE_BUDGET), counting every existing target as working width × height × 4: least recently used
 * scratches are dropped first, then least recently used sizes. The size of the CURRENT call is never evicted, so a
 * single working size whose 2-3 targets exceed the budget is kept while in use (the total is then just that entry).
 *
 * Worst cases (working size = source capped at 2× the format's long side and MAX_TEXTURE_SIZE; 1 target = W×H×4):
 *   format 1080p (working ≤ 3840×2160): 33.2 MB/target; 3 sizes × 2 = 199 MB, × 3 with scratch = 299 MB (< budget).
 *   format 4K or portrait 4K (≤ 7680×4320): 132.7 MB/target; one size 265 MB (pair) / 398 MB (with scratch); three
 *   sizes would be 796 MB / 1.19 GB, so the budget caps the total at 671 MB (640 MiB).
 *   format 8K (≤ 15360×8640 where MAX_TEXTURE_SIZE ≥ 16384): 531 MB/target, one size alone 1.06-1.59 GB: the only
 *   case above the budget, transiently, for the size in use.
 */
export class TargetPool {
  private readonly entries = new Map<string, PoolEntry>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly max = 3,
    private readonly budget = POOL_BYTE_BUDGET,
  ) {}

  /**
   * A target of `size` whose texture is none of `avoid` (the source a pass samples and the effect's input): the
   * first of the pair that qualifies, else the scratch target (created on first need). Each target reallocates only
   * when first bound at that size. With two distinct textures to avoid there is always one left.
   */
  target(size: Size, avoid: readonly WebGLTexture[]): RenderTarget {
    const entry = this.entry(size);
    let target = entry.pair.find((t) => !avoid.includes(t.slot.tex));
    if (!target) {
      try {
        entry.scratch ??= new RenderTarget(this.gl);
      } catch (e) {
        assertNotLost(this.gl);
        throw e;
      }
      target = entry.scratch;
    }
    this.enforceBudget(entry);
    return target;
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
    const entry: PoolEntry = { pair: this.create(), bytes: size.width * size.height * 4 };
    this.entries.set(key, entry);
    for (const [k, old] of this.entries) {
      if (this.entries.size <= this.max) break;
      for (const t of all(old)) t.dispose();
      this.entries.delete(k);
    }
    return entry;
  }

  /** Drops LRU scratches, then LRU sizes, other than `current`, while the planned bytes exceed the budget. */
  private enforceBudget(current: PoolEntry): void {
    const planned = (): number => [...this.entries.values()].reduce((n, e) => n + all(e).length * e.bytes, 0);
    for (const e of this.entries.values()) {
      if (planned() <= this.budget) return;
      if (e !== current && e.scratch) {
        e.scratch.dispose();
        e.scratch = undefined;
      }
    }
    for (const [k, e] of this.entries) {
      if (planned() <= this.budget) return;
      if (e === current) continue;
      for (const t of all(e)) t.dispose();
      this.entries.delete(k);
    }
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
