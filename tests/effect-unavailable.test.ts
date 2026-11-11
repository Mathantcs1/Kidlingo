import { describe, expect, it } from 'vitest';
import { defaultClipAudio, defaultTransform, emptyProject } from '../src/core/model';
import type { Clip, Project, VideoEffect, VideoEffectType } from '../src/core/model';
import { BLEND_UNAVAILABLE_MESSAGE, effectUnavailableMessage, exportSkipNotice, skippedEffectTypes } from '../src/render/effects/unavailable';

const fx = (type: VideoEffectType, enabled = true): VideoEffect => ({ id: `fx-${type}`, type, enabled, params: {} });
const clip = (id: string, effects: VideoEffect[]): Clip => ({
  id, mediaId: 'img', kind: 'image', start: 0, in: 0, out: 3, transform: defaultTransform(), volume: 1,
  fit: 'fit', audio: defaultClipAudio(), effects, blend: 'normal',
});

/** Two video tracks: the first visible with `shown`, the second hidden with `hidden`. */
function project(shown: VideoEffect[], hidden: VideoEffect[] = []): Project {
  const p = emptyProject();
  const video = p.tracks.find((t) => t.kind === 'video')!;
  return {
    ...p,
    tracks: [
      { ...video, clips: [clip('a', shown)] },
      { ...video, id: 'hidden-track', hidden: true, clips: [clip('b', hidden)] },
      ...p.tracks.filter((t) => t.kind !== 'video'),
    ],
  };
}

describe('skippedEffectTypes', () => {
  it('lists only unavailable types that an enabled effect on a visible track uses, in failure order', () => {
    const p = project([fx('colour'), fx('glow'), fx('grain')]);
    expect(skippedEffectTypes(p, ['grain', 'blur', 'glow'])).toEqual(['grain', 'glow']);
  });

  it('ignores disabled effects and hidden tracks', () => {
    const p = project([fx('glow', false)], [fx('blur')]);
    expect(skippedEffectTypes(p, ['glow', 'blur'])).toEqual([]);
  });

  it('is empty when nothing failed', () => {
    expect(skippedEffectTypes(project([fx('glow')]), [])).toEqual([]);
  });
});

describe('notices', () => {
  it('names the effect in the preview toast', () => {
    expect(effectUnavailableMessage('glow')).toBe('The Glow effect cannot run on this device, so it is skipped.');
  });

  it('lists skipped effects and LUTs for the export, or null when nothing was skipped', () => {
    expect(exportSkipNotice({ effects: [], luts: [] })).toBeNull();
    expect(exportSkipNotice({ effects: ['glow', 'grain'], luts: [] })).toBe(
      'Exported without these effects (this device cannot run them): Glow, Film grain.',
    );
    expect(exportSkipNotice({ effects: [], luts: ['Warm.cube'] })).toBe(
      'Exported without these LUTs (the file is missing or not a valid .cube): "Warm.cube".',
    );
    expect(exportSkipNotice({ effects: ['glow'], luts: ['A', 'B'] })).toBe(
      'Exported without these effects (this device cannot run them): Glow. ' +
        'Exported without these LUTs (the file is missing or not a valid .cube): "A", "B".',
    );
    expect(exportSkipNotice({ effects: ['glow'], luts: [] }, 'Merged')).toBe(
      'Merged without these effects (this device cannot run them): Glow.',
    );
  });

  it('adds a blend line to the export or merge notice', () => {
    expect(exportSkipNotice({ effects: [], luts: [], blend: false })).toBeNull();
    expect(exportSkipNotice({ effects: [], luts: [], blend: true })).toBe(
      'Exported with blend modes drawn as Normal and adjustment layers skipped (this device cannot run them).',
    );
    expect(exportSkipNotice({ effects: ['glow'], luts: [], blend: true }, 'Merged')).toBe(
      'Merged without these effects (this device cannot run them): Glow. Merged with blend modes drawn as Normal and adjustment layers skipped (this device cannot run them).',
    );
  });

  it('words the preview toast for blend modes', () => {
    expect(BLEND_UNAVAILABLE_MESSAGE).toBe('Blend modes and adjustment layers are unavailable on this device; blend modes draw as Normal and adjustment layers are skipped.');
  });
});
