// GL resources of the effect passes: ping-pong target pairs pooled by size, and the fullscreen unit quad.
import type { Size } from '../geometry';
import { GlUnavailableError } from '../glErrors';
import { RenderTarget } from '../renderTarget';
import { assertNotLost } from './programs';

export type TargetPair = [RenderTarget, RenderTarget];

/** Pairs of ping-pong targets keyed by working size, least recently used evicted beyond `max` (default 3). */
export class TargetPool {
  private readonly pairs = new Map<string, TargetPair>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly max = 3,
  ) {}

  /** The pair for `size` (a clip's working size): each target reallocates only when first bound at that size. */
  pair(size: Size): TargetPair {
    const key = `${size.width}x${size.height}`;
    const hit = this.pairs.get(key);
    if (hit) {
      this.pairs.delete(key);
      this.pairs.set(key, hit);
      return hit;
    }
    const pair = this.create();
    this.pairs.set(key, pair);
    for (const [k, old] of this.pairs) {
      if (this.pairs.size <= this.max) break;
      for (const t of old) t.dispose();
      this.pairs.delete(k);
    }
    return pair;
  }

  dispose(): void {
    for (const pair of this.pairs.values()) for (const t of pair) t.dispose();
    this.pairs.clear();
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
