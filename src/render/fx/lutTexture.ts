// 3D textures for the project's `.cube` LUTs, loaded lazily (async) before a frame's synchronous effect stage and
// shared by every clip that uses the same LUT. A LUT that cannot be loaded is remembered as missing for the session.
import type { Id } from '../../core/model';
import { parseCube } from '../../fx/cube';
import { getLutText } from '../../media/luts';

export interface LutTexture {
  tex: WebGLTexture;
  size: number;
  domainMin: [number, number, number];
  /** 1 / (domainMax - domainMin) per channel. */
  domainScale: [number, number, number];
}

export class LutTextures {
  private readonly ready = new Map<Id, LutTexture | null>();
  private readonly pending = new Map<Id, Promise<void>>();

  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly load: (id: Id) => Promise<string | null> = getLutText,
  ) {}

  get count(): number {
    let n = 0;
    for (const t of this.ready.values()) if (t) n++;
    return n;
  }

  /** Loads and uploads every LUT in `ids` that is not known yet. Never rejects. */
  async ensure(ids: Iterable<Id>): Promise<void> {
    await Promise.all([...new Set(ids)].map((id) => this.one(id)));
  }

  peek(id: Id | undefined): LutTexture | null {
    return id === undefined ? null : (this.ready.get(id) ?? null);
  }

  dispose(): void {
    for (const t of this.ready.values()) if (t) this.gl.deleteTexture(t.tex);
    this.ready.clear();
  }

  private one(id: Id): Promise<void> {
    if (this.ready.has(id)) return Promise.resolve();
    let p = this.pending.get(id);
    if (!p) {
      p = this.read(id).then((t) => {
        this.ready.set(id, t);
        this.pending.delete(id);
      });
      this.pending.set(id, p);
    }
    return p;
  }

  private async read(id: Id): Promise<LutTexture | null> {
    try {
      const text = await this.load(id);
      if (text === null) return null;
      const cube = parseCube(text);
      if (!cube.ok) return null;
      return this.upload(cube);
    } catch {
      return null;
    }
  }

  private upload(cube: { size: number; data: Float32Array; domainMin: [number, number, number]; domainMax: [number, number, number] }): LutTexture | null {
    const gl = this.gl;
    const { size, data } = cube;
    const bytes = new Uint8Array(size ** 3 * 4);
    for (let i = 0; i < size ** 3; i++) {
      for (let k = 0; k < 3; k++) bytes[i * 4 + k] = Math.round(Math.min(1, Math.max(0, data[i * 3 + k])) * 255);
      bytes[i * 4 + 3] = 255;
    }
    const tex = gl.createTexture();
    if (!tex) return null;
    gl.bindTexture(gl.TEXTURE_3D, tex);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_3D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    for (const wrap of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, wrap, gl.CLAMP_TO_EDGE);
    // uploadTexture leaves these on for the 2D frames; WebGL2 rejects them (INVALID_OPERATION) for 3D uploads.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4);
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, size, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
    return {
      tex, size, domainMin: cube.domainMin,
      domainScale: cube.domainMin.map((lo, i) => 1 / (cube.domainMax[i] - lo)) as [number, number, number],
    };
  }
}
