// LutTextures (Plan 4 Task 6): load once per media id, report an unusable LUT once, RGB16F with an RGBA8 fallback.
import { describe, expect, it, vi } from 'vitest';
import { LutTextures, lutRefs, lutUnavailableMessage } from '../src/render/effects/luts';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, MediaRef, Project, VideoEffect } from '../src/core/model';
import { fakeGl } from './fake-gl';

const CUBE = ['LUT_3D_SIZE 2', '0 0 0', '1 0 0', '0 1 0', '1 1 0', '0 0 1', '1 0 1', '0 1 1', '1 1 1'].join('\n');
const lutMedia = (id: string, missing = false): MediaRef => ({ id, name: `${id}.cube`, kind: 'lut', duration: 0, hasAudio: false, ...(missing ? { missing } : {}) });
const fx = (ref: string, enabled = true): VideoEffect => ({ id: `e-${ref}`, type: 'lut', enabled, params: { intensity: 1 }, ref });
const clip = (effects: VideoEffect[]): Clip => ({
  id: 'c', mediaId: 'v', kind: 'video', start: 0, in: 0, out: 1, transform: defaultTransform(), volume: 1,
  audio: defaultClipAudio(), effects, blend: 'normal', fit: 'fit',
});
/** A fake GL whose getError answers NO_ERROR, unless `error()` says otherwise. */
function okGl(error: (log: [string, unknown[]][]) => boolean = () => false) {
  const f: ReturnType<typeof fakeGl> = fakeGl({ getError: () => f.k(error(f.log) ? 'INVALID_OPERATION' : 'NO_ERROR') });
  return f;
}
const project = (media: MediaRef[]): Project => ({ ...emptyProject(), media: Object.fromEntries(media.map((m) => [m.id, m])) });

describe('LutTextures', () => {
  it('loads, parses and uploads once per id, sharing an in-flight load', async () => {
    const { gl, count, log, k } = okGl();
    const load = vi.fn(async () => CUBE);
    const luts = new LutTextures(gl, vi.fn(), load);
    const [a, b] = await Promise.all([luts.get('L'), luts.get('L')]);
    expect(a).not.toBeNull();
    expect(b).toBe(a);
    expect(await luts.get('L')).toBe(a);
    expect(load).toHaveBeenCalledTimes(1);
    expect(count('texImage3D')).toBe(1);
    const upload = log.find(([n]) => n === 'texImage3D')!;
    expect(upload[1].slice(1, 8)).toEqual([0, k('RGB16F'), 2, 2, 2, 0, k('RGB')]);
    expect(log.filter(([n, a]) => n === 'texParameteri' && a[2] === k('LINEAR'))).toHaveLength(2);
    // 3D uploads refuse FLIP_Y / PREMULTIPLY_ALPHA (the image uploads' settings): both off before the upload.
    const before = log.slice(0, log.indexOf(upload));
    for (const p of ['UNPACK_FLIP_Y_WEBGL', 'UNPACK_PREMULTIPLY_ALPHA_WEBGL']) {
      expect(before.filter(([n, a]) => n === 'pixelStorei' && a[0] === k(p)).at(-1)?.[1][1], p).toBe(false);
    }
    const loaded = await luts.loaded('L');
    expect(loaded).toMatchObject({ size: 2, domainMin: [0, 0, 0], domainMax: [1, 1, 1] });
    luts.dispose();
    expect(count('deleteTexture')).toBe(1);
  });

  it('falls back to RGBA8 when RGB16F is refused', async () => {
    const { gl, log, k } = okGl((log) => log.at(-2)?.[0] === 'texImage3D' && log.filter(([n]) => n === 'texImage3D').length === 1);
    await new LutTextures(gl, vi.fn(), async () => CUBE).get('L');
    const uploads = log.filter(([n]) => n === 'texImage3D');
    expect(uploads.map(([, a]) => a[2])).toEqual([k('RGB16F'), k('RGBA8')]);
    expect([...(uploads[1][1][9] as Uint8Array).slice(0, 8)]).toEqual([0, 0, 0, 255, 255, 0, 0, 255]);
  });

  it('a missing or malformed file is null, reported once and never retried', async () => {
    const { gl, count } = okGl();
    const onUnavailable = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const load = vi.fn(async (id: string) => {
      if (id === 'gone') throw new Error('Media gone is not stored on this device');
      return 'LUT_1D_SIZE 4';
    });
    const luts = new LutTextures(gl, onUnavailable, load);
    for (let i = 0; i < 3; i++) {
      expect(await luts.get('gone')).toBeNull();
      expect(await luts.get('bad')).toBeNull();
    }
    expect(onUnavailable.mock.calls).toEqual([['gone'], ['bad']]);
    expect(load).toHaveBeenCalledTimes(2);
    expect(count('texImage3D')).toBe(0);
    warn.mockRestore();
  });

  it('forFrame loads the enabled LUTs of the clips; refs to absent, missing or non-LUT media are unavailable', async () => {
    const { gl } = okGl();
    const onUnavailable = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const load = vi.fn(async () => CUBE);
    const luts = new LutTextures(gl, onUnavailable, load);
    const p = project([lutMedia('A'), lutMedia('M', true), { ...lutMedia('V'), kind: 'video' }]);
    const clips = [clip([fx('A'), fx('B'), fx('M'), fx('V'), fx('off', false)])];
    expect(lutRefs(clips)).toEqual(['A', 'B', 'M', 'V']);
    const frame = await luts.forFrame(p, clips);
    expect([...frame.keys()]).toEqual(['A']);
    await luts.forFrame(p, clips);
    expect(onUnavailable.mock.calls).toEqual([['B'], ['M'], ['V']]);
    expect(load).toHaveBeenCalledTimes(1);
    expect(lutUnavailableMessage('Warm')).toBe('The LUT "Warm" could not be loaded, so its effect is skipped.');
    warn.mockRestore();
  });

  it('uploads nothing once disposed', async () => {
    const { gl, count } = okGl();
    const luts = new LutTextures(gl, vi.fn(), async () => CUBE);
    const pending = luts.get('L');
    luts.dispose();
    expect(await pending).toBeNull();
    expect(count('texImage3D')).toBe(0);
  });

  it('a fallback upload that fails too (out of memory) deletes the texture: null, one notice, never black', async () => {
    const { gl, count } = okGl((log) => log.at(-2)?.[0] === 'texImage3D');
    const onUnavailable = vi.fn();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const luts = new LutTextures(gl, onUnavailable, async () => CUBE);
    expect(await luts.get('L')).toBeNull();
    expect(await luts.get('L')).toBeNull();
    expect(count('texImage3D')).toBe(2);
    expect(count('deleteTexture')).toBe(1);
    expect(onUnavailable.mock.calls).toEqual([['L']]);
    luts.dispose();
    expect(count('deleteTexture')).toBe(1);
    warn.mockRestore();
  });

  it('forFrame evicts LUTs no longer in the project (and reloads one that comes back)', async () => {
    const { gl, count } = okGl();
    const load = vi.fn(async () => CUBE);
    const luts = new LutTextures(gl, vi.fn(), load);
    const both = project([lutMedia('A'), lutMedia('B')]);
    await luts.forFrame(both, [clip([fx('A'), fx('B')])]);
    // B is still in the project's media (an undo away), only unused this frame: kept.
    await luts.forFrame(both, [clip([fx('A')])]);
    expect(count('deleteTexture')).toBe(0);
    // A left the project: its texture is freed, even though nothing on screen uses it.
    await luts.forFrame(project([lutMedia('B')]), []);
    expect(count('deleteTexture')).toBe(1);
    expect(load).toHaveBeenCalledTimes(2);
    const back = await luts.forFrame(project([lutMedia('A'), lutMedia('B')]), [clip([fx('A')])]);
    expect([...back.keys()]).toEqual(['A']);
    expect(load).toHaveBeenCalledTimes(3);
  });
});
