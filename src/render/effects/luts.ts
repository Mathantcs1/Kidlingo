// LUT media → TEXTURE_3D, cached per media id for one GL context (Plan 4 Task 6). The compositor loads every visible
// clip's LUTs in Phase 1 (`forFrame`), so the draw phase looks them up synchronously through EffectContext.lut.
import type { Clip, Id, Project } from '../../core/model';
import { parseCube } from '../../media/cube';
import type { CubeLut } from '../../media/cube';
import { getMediaFile } from '../../media/storage';
import type { LoadedLut } from './types';

export { lutUnavailableMessage } from '../../media/cube';

/** Reads a stored LUT file's text (OPFS by default; tests inject their own). */
export type LutLoader = (mediaId: Id) => Promise<string>;
const fromStorage: LutLoader = async (id) => (await getMediaFile(id)).text();

/** The LUT media ids referenced by the enabled lut effects of `clips`, in first-use order. */
export function lutRefs(clips: Iterable<Clip>): Id[] {
  const ids = new Set<Id>();
  for (const c of clips) for (const e of c.effects ?? []) if (e.type === 'lut' && e.enabled && e.ref !== undefined) ids.add(e.ref);
  return [...ids];
}

/**
 * Uploads `lut` as an RGB16F TEXTURE_3D (width = red, height = green, depth = blue: the file's red-fastest order is
 * the texel order). Half floats keep about 11 bits per channel and values outside 0..1; where RGB16F is refused the
 * fallback is RGBA8 (8 bits per lattice value, clamped to 0..1). Both are filterable: LINEAR gives the trilinear lookup.
 */
function upload(gl: WebGL2RenderingContext, lut: CubeLut): WebGLTexture {
  const tex = gl.createTexture();
  if (!tex) throw new Error('Could not create a LUT texture');
  const n = lut.size;
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_3D, tex);
  for (const p of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, p, gl.LINEAR);
  for (const p of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, p, gl.CLAMP_TO_EDGE);
  // 3D uploads refuse FLIP_Y / PREMULTIPLY_ALPHA (which image uploads set): off for this upload, then restored.
  const unpack = [gl.UNPACK_FLIP_Y_WEBGL, gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, gl.UNPACK_ALIGNMENT];
  const saved = unpack.map((p) => gl.getParameter(p) as number | boolean);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  // Clear earlier errors so the check below is about this upload (bounded: a lost context reports one forever).
  for (let i = 0; i < 8 && gl.getError() !== gl.NO_ERROR; i++);
  gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGB16F, n, n, n, 0, gl.RGB, gl.FLOAT, lut.data);
  if (gl.getError() !== gl.NO_ERROR) {
    const bytes = new Uint8Array(n * n * n * 4);
    for (let i = 0; i < n * n * n; i++) {
      for (let k = 0; k < 3; k++) bytes[i * 4 + k] = Math.round(Math.min(1, Math.max(0, lut.data[i * 3 + k])) * 255);
      bytes[i * 4 + 3] = 255;
    }
    gl.texImage3D(gl.TEXTURE_3D, 0, gl.RGBA8, n, n, n, 0, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
  }
  const failed = gl.getError() !== gl.NO_ERROR;
  unpack.forEach((p, i) => gl.pixelStorei(p, saved[i] as number));
  gl.bindTexture(gl.TEXTURE_3D, null);
  // Both uploads refused (e.g. out of memory): an empty texture would sample black and blank the clip (D8).
  if (failed) {
    gl.deleteTexture(tex);
    throw new Error('Could not upload the LUT texture');
  }
  return tex;
}

export class LutTextures {
  private readonly loading = new Map<Id, Promise<LoadedLut | null>>();
  private readonly ready = new Map<Id, LoadedLut>();
  private readonly reported = new Set<Id>();
  private disposed = false;

  /** `onUnavailable(id)` is called once per media id whose LUT cannot be used (missing, unreadable, not a LUT). */
  constructor(
    private readonly gl: WebGL2RenderingContext,
    private readonly onUnavailable: (mediaId: Id) => void = () => undefined,
    private readonly load: LutLoader = fromStorage,
  ) {}

  /**
   * The LUT of `mediaId` as a TEXTURE_3D, loaded, parsed and uploaded on first use; concurrent calls share one load.
   * Null (reported once, cached: never retried) when the file is missing, unreadable or not a valid .cube.
   */
  async get(mediaId: Id): Promise<WebGLTexture | null> {
    return (await this.loaded(mediaId))?.texture ?? null;
  }

  /** As get, with the LUT's size and domain (what EffectContext.lut returns). */
  loaded(mediaId: Id): Promise<LoadedLut | null> {
    const cached = this.loading.get(mediaId);
    if (cached) return cached;
    const p: Promise<LoadedLut | null> = this.fetch(mediaId, () => this.loading.get(mediaId) === p);
    this.loading.set(mediaId, p);
    return p;
  }

  /**
   * Phase 1 of a frame: loads the LUT of every enabled lut effect of `clips` and returns them by media id. A ref to
   * media that is not a LUT of `p` (or is flagged missing) is unavailable without touching storage. LUTs cached for
   * media that has left `p` (not in its media table, not referenced by any of its effects) are freed.
   */
  async forFrame(p: Project, clips: Iterable<Clip>): Promise<Map<Id, LoadedLut>> {
    this.evict(p);
    const out = new Map<Id, LoadedLut>();
    for (const id of lutRefs(clips)) {
      const m = p.media[id];
      const lut = m?.kind === 'lut' && !m.missing ? await this.loaded(id) : this.fail(id, null);
      if (lut) out.set(id, lut);
    }
    return out;
  }

  /** Deletes every uploaded texture; later loads resolve to null. Idempotent. */
  dispose(): void {
    this.disposed = true;
    for (const lut of this.ready.values()) this.gl.deleteTexture(lut.texture);
    this.ready.clear();
    this.loading.clear();
  }

  private evict(p: Project): void {
    if (this.loading.size === 0) return;
    const refs = new Set(p.tracks.flatMap((t) => t.clips.flatMap((c) => (c.effects ?? []).map((e) => e.ref))));
    for (const id of [...this.loading.keys()]) {
      if (p.media[id] || refs.has(id)) continue;
      const lut = this.ready.get(id);
      if (lut) this.gl.deleteTexture(lut.texture);
      this.ready.delete(id);
      this.loading.delete(id);
      this.reported.delete(id);
    }
  }

  /** `current()` is false once this load was evicted (or the cache disposed): its result is then not kept. */
  private async fetch(mediaId: Id, current: () => boolean): Promise<LoadedLut | null> {
    let lut: CubeLut;
    try {
      lut = parseCube(await this.load(mediaId));
    } catch (e) {
      return this.fail(mediaId, e);
    }
    // Disposed or lost meanwhile: nothing to upload into (not the LUT's fault, so not reported).
    if (this.disposed || this.gl.isContextLost() || !current()) return null;
    let texture: WebGLTexture;
    try {
      texture = upload(this.gl, lut);
    } catch (e) {
      return this.gl.isContextLost() ? null : this.fail(mediaId, e);
    }
    const loaded: LoadedLut = { texture, size: lut.size, domainMin: lut.domainMin, domainMax: lut.domainMax };
    this.ready.set(mediaId, loaded);
    return loaded;
  }

  private fail(mediaId: Id, e: unknown): null {
    if (this.reported.has(mediaId)) return null;
    this.reported.add(mediaId);
    console.warn(`clipforge: LUT ${mediaId} is unavailable; its effect is skipped`, e ?? '');
    this.onUnavailable(mediaId);
    return null;
  }
}
