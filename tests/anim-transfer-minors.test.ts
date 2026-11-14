// Plan 5B final review M2 (audio clips in a multi-clip Paste animation are skipped and counted) and M3 (a user preset
// with relative positions anchors to the destination's RESOLVED position when that position is keyed).
import { describe, expect, it } from 'vitest';
import { copyAnimation } from '../src/core/animPayload';
import { pasteAnimation } from '../src/core/animTransfer';
import { TimelineError } from '../src/core/timeline';
import { applyUserPreset, presetFromAnimation } from '../src/core/userPresets';
import { clipOf, k, pk, project } from './anim-transfer.fixtures';

describe('Paste animation with an audio clip selected (M2)', () => {
  const src = () => project({ V: { keys: { opacity: [k(0, 0), k(1, 1)] } } });
  it('skips the audio clip, pastes the rest as ONE project, and counts the skip', () => {
    const p = src();
    const pl = copyAnimation(p, 'V');
    const dst = project({ V: {}, P: {} });
    const r = pasteAnimation(dst, ['V', 'AU'], pl);
    expect(clipOf(r.project, 'V').keys!.opacity).toHaveLength(2);
    expect(r.skipped).toBe(1);
    expect(r.project.tracks.find((t) => t.clips.some((c) => c.id === 'AU'))).toBe(dst.tracks.find((t) => t.clips.some((c) => c.id === 'AU')));
  });
  it('refuses only when nothing valid is left', () => {
    const pl = copyAnimation(src(), 'V');
    expect(() => pasteAnimation(project(), ['AU'], pl)).toThrow(TimelineError);
  });
});

describe('user preset onto a clip with keyed position (M3)', () => {
  it('anchors relative positions to the position resolved at the anchor, not the stale static x/y', () => {
    const slide = project({ V: { keys: { position: [pk(0, 100, 50), pk(1, 400, 50)] } } });
    const preset = presetFromAnimation(copyAnimation(slide, 'V'), 'Glide', 'in', 1, 'id1');
    const dst = project({ P: { mediaId: 'video', kind: 'video', start: 0, keys: { position: [pk(0, 200, 20), pk(1, 600, 20)] } } });
    const r = applyUserPreset(dst, 'P', preset, 0);
    // 'in' anchors at the clip start (local 0): the keyed position there is (200, 20), static transform is (0, 0).
    expect(clipOf(r, 'P').keys!.position!.map((x) => [x.x, x.y])).toEqual([[200, 20], [500, 20]]);
  });
});
