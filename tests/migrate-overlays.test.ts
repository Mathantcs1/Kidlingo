// Data v5 (Plan 4 Task 12): v4 saves open unchanged as v5; overlay clips are repaired per field; v6 is refused.
import { describe, it, expect } from 'vitest';
import { migrateProject } from '../src/core/migrate';
import { defaultClipAudio, emptyProject } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { overlayDefaults } from '../src/core/overlaySpec';

const vclip = (id: string, extra: Record<string, unknown> = {}) => ({
  id, mediaId: 'm1', kind: 'video', start: 0, in: 0, out: 2, volume: 1, fit: 'fit',
  transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, audio: defaultClipAudio(), effects: [], blend: 'normal', ...extra,
});
const overlay = (id: string, spec: unknown, extra: Record<string, unknown> = {}) =>
  vclip(id, { kind: 'overlay', mediaId: '', start: 3, overlay: spec, ...extra });

function v4(clips: unknown[], audioClips: unknown[] = []) {
  return {
    version: 4,
    format: { width: 1920, height: 1080, fps: 30 },
    tracks: [
      { id: 'v', kind: 'video', name: '', hidden: false, muted: false, solo: false, locked: false, volume: 1, duck: null, clips },
      { id: 'a', kind: 'audio', name: '', hidden: false, muted: false, solo: false, locked: false, volume: 1, duck: null, clips: audioClips },
    ],
    media: { m1: { id: 'm1', name: 'a.mp4', kind: 'video', duration: 4, hasAudio: true } },
  };
}
const clipsOf = (p: Project): Clip[] => p.tracks.flatMap((t) => t.clips);
const ok = (raw: unknown): Project => {
  const r = migrateProject(raw);
  if (!r.ok) throw new Error(`not ok: ${r.reason}`);
  return r.project;
};

describe('migrate to v5', () => {
  it('opens a v4 save unchanged apart from the version, without mutating it; idempotent', () => {
    const raw = v4([vclip('c1')]);
    const snap = JSON.stringify(raw);
    const p = ok(raw);
    expect(JSON.stringify(raw)).toBe(snap);
    expect(p.version).toBe(5);
    expect({ ...p, version: 4 }).toEqual(raw);
    expect(ok(p)).toEqual(p);
    expect(emptyProject().version).toBe(5);
  });
  it('refuses newer versions (v6 and later)', () => {
    expect(migrateProject({ ...v4([]), version: 6 })).toEqual({ ok: false, reason: 'newer' });
    expect(migrateProject({ version: 6 })).toEqual({ ok: false, reason: 'newer' });
  });
  it('keeps a valid overlay clip exactly', () => {
    const spec = { ...overlayDefaults('sticker'), sticker: 'fire' };
    const raw = { ...v4([overlay('o1', spec)]), version: 5 };
    expect(ok(raw)).toEqual(raw);
  });
  it('repairs overlay fields one by one', () => {
    const spec = { type: 'lowerThird', text: 42, subtext: 'x'.repeat(200), colour: 'red', accent: '#ABCDEF', sticker: 'star', extra: 1 };
    const p = ok({ ...v4([overlay('o1', spec, { mediaId: 'm1', effects: [{ id: 'e', type: 'colour', enabled: true, params: {} }], blend: 'multiply', fit: 'blur' })]), version: 5 });
    const [o] = clipsOf(p);
    const d = overlayDefaults('lowerThird');
    expect(o).toMatchObject({ kind: 'overlay', mediaId: '', effects: [], blend: 'normal', fit: 'fit' });
    expect(o.overlay).toEqual({ type: 'lowerThird', text: d.text, subtext: 'x'.repeat(80), colour: d.colour, accent: '#abcdef', extra: 1 });
  });
  it('gives a sticker overlay without a valid sticker the default one', () => {
    const p = ok({ ...v4([overlay('o1', { type: 'sticker', sticker: 'cat' })]), version: 5 });
    expect(clipsOf(p)[0].overlay).toEqual(overlayDefaults('sticker'));
  });
  it('drops an overlay clip it cannot understand or that sits on an audio track; keeps the rest', () => {
    const raw = { ...v4([vclip('c1'), overlay('o1', { type: 'hologram' }), overlay('o2', null)], [overlay('o3', overlayDefaults('sticker'))]), version: 5 };
    const p = ok(raw);
    expect(clipsOf(p).map((c) => c.id)).toEqual(['c1']);
  });
});
