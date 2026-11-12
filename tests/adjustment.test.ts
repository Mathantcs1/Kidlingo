// Adjustment layers (Plan 4 Task 13a): placement like overlays, refusals, the media[] audit (never audible, decoded,
// GC-referenced or a media use), effects/looks/blend allowed but fit refused, trimming, migration and the add command.
import { beforeEach, describe, expect, it } from 'vitest';
import { clipDuration, newTrack } from '../src/core/model';
import type { Clip, Project } from '../src/core/model';
import { ADJUSTMENT_LABEL, addAdjustmentClip, newAdjustmentClip } from '../src/core/adjustment';
import { reframeProject } from '../src/core/merge';
import { migrateProject } from '../src/core/migrate';
import { addOverlayClip } from '../src/core/overlays';
import { MAX_TRACKS_PER_KIND, setTrackFlags } from '../src/core/tracks';
import { TimelineError, splitClip, trimClip } from '../src/core/timeline';
import { addVideoEffect, applyLook, setClipBlend } from '../src/core/videoEffectEdits';
import { audibleClips } from '../src/audio/plan';
import { syncExportSources } from '../src/export/exportSources';
import { referencedMedia } from '../src/media/gc';
import { skippedEffectTypes } from '../src/render/effects/unavailable';
import { visualClipsAt } from '../src/render/visible';
import { useEditor } from '../src/state/store';
import { laneRejects } from '../src/ui/drag';
import { clipsUsingMedia, hiddenLayerClipCount, replaceWithMedia, setClipFit } from '../src/ui/edits';
import { addAdjustmentCmd } from '../src/ui/overlayCommands';
import { sourceSizeFor } from '../src/ui/overlayMath';
import { useToasts } from '../src/ui/Toast';
import { all, base, video } from './overlay-fixtures';
import { CURRENT_VERSION } from './helpers/project';

const adjustments = (p: Project): Clip[] => all(p).filter((c) => c.kind === 'adjustment');
const withAdj = (): Project => addAdjustmentClip(base(), 'v', 6);
const glow = { id: 'g', type: 'glow' as const, enabled: true, params: {} };

describe('addAdjustmentClip', () => {
  it('adds a full-frame, media-less clip to the target track when it has room, without mutating the input', () => {
    const p = base();
    const snap = JSON.stringify(p);
    const q = addAdjustmentClip(p, 'v', 5);
    expect(JSON.stringify(p)).toBe(snap);
    expect(q.tracks).toHaveLength(2);
    const [a] = adjustments(q);
    expect(a).toMatchObject({
      kind: 'adjustment', mediaId: '', start: 5, in: 0, out: 5, effects: [], blend: 'normal', fit: 'fit',
      transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    });
    expect(a.overlay).toBeUndefined();
    expect(q.tracks[0].clips.map((c) => c.kind)).toEqual(['video', 'adjustment']);
  });
  it('uses the given duration and clamps a negative start to 0', () => {
    const q = addAdjustmentClip({ ...base(), tracks: [{ ...newTrack('video'), id: 'v' }] }, 'v', -3, 2);
    expect(adjustments(q)[0]).toMatchObject({ start: 0, out: 2 });
  });
  it('makes a new video layer above the others when the target has no room (shared placement with overlays)', () => {
    const q = addAdjustmentClip(base(), 'v', 1);
    expect(q.tracks.map((t) => t.kind)).toEqual(['video', 'video', 'audio']);
    expect(q.tracks[0].clips).toHaveLength(1);
    expect(q.tracks[1].clips[0]).toMatchObject({ kind: 'adjustment', start: 1 });
    const o = addOverlayClip(base(), 'v', 'sticker', 1);
    expect(o.tracks.map((t) => t.clips.map((c) => c.kind))).toEqual([['video'], ['overlay'], []]);
  });
  it('refuses a locked target, an audio track, an unknown track, a full layer stack and bad times', () => {
    const p = base();
    expect(() => addAdjustmentClip(setTrackFlags(p, 'v', { locked: true }), 'v', 6)).toThrow(new TimelineError('Track is locked'));
    expect(() => addAdjustmentClip(p, 'a', 6)).toThrow(new TimelineError('Adjustment layers go on a video track'));
    expect(() => addAdjustmentClip(p, 'nope', 6)).toThrow(TimelineError);
    let full = p;
    for (let i = 1; i < MAX_TRACKS_PER_KIND; i++) full = { ...full, tracks: [{ ...newTrack('video'), clips: [video(`x${i}`)] }, ...full.tracks] };
    expect(() => addAdjustmentClip(full, 'v', 1)).toThrow(new TimelineError(`At most ${MAX_TRACKS_PER_KIND} video tracks`));
    expect(() => addAdjustmentClip(p, 'v', NaN)).toThrow(TimelineError);
    expect(() => addAdjustmentClip(p, 'v', 6, 0)).toThrow(TimelineError);
    expect(() => addAdjustmentClip(p, 'v', 6, Infinity)).toThrow(TimelineError);
  });
});

describe('adjustment clips take effects, looks and blend modes but no fit', () => {
  it('effect edits, looks and blend modes work exactly as on a video clip', () => {
    const q = withAdj();
    const id = adjustments(q)[0].id;
    const withBw = addVideoEffect(q, id, 'bw');
    expect(adjustments(withBw)[0].effects.map((e) => e.type)).toEqual(['bw']);
    const r = setClipBlend(applyLook(withBw, id, 'tealOrange'), id, 'multiply');
    const a = adjustments(r)[0];
    expect(a.effects.length).toBeGreaterThan(0);
    expect(a.effects).not.toEqual(adjustments(withBw)[0].effects);
    expect(a.blend).toBe('multiply');
  });
  it('refuses a fit mode; effects on an overlay are still refused', () => {
    const q = withAdj();
    expect(() => setClipFit(q, adjustments(q)[0].id, 'fill')).toThrow(new TimelineError('Adjustment layers have no frame to fit'));
    const o = addOverlayClip(base(), 'v', 'sticker', 6);
    const oid = all(o).find((c) => c.kind === 'overlay')!.id;
    expect(() => addVideoEffect(o, oid, 'bw')).toThrow(new TimelineError('Overlays cannot have effects'));
  });
});

describe('adjustment clips are not media', () => {
  it('are never audible, never a GC reference and never a media use', () => {
    const q = withAdj();
    expect(audibleClips(q).map((c) => c.id)).toEqual(['c1']);
    expect([...referencedMedia({ past: [], present: q, future: [] })]).toEqual(['m1']);
    expect(clipsUsingMedia(q, '')).toBe(0);
    expect(sourceSizeFor(adjustments(q)[0], undefined, { width: 100, height: 100 }, q.format)).toBeNull();
  });
  it('are never decoded by the exporter', async () => {
    const q = withAdj();
    const opened: string[] = [];
    const sources = new Map();
    await syncExportSources(q, 7, sources, async (id) => {
      opened.push(id);
      return { frameAt: async () => null, close: () => undefined } as never;
    }, () => undefined);
    expect(opened).toEqual([]);
    await syncExportSources(q, 1, sources, async (id) => {
      opened.push(id);
      return { frameAt: async () => null, close: () => undefined } as never;
    }, () => undefined);
    expect(opened).toEqual(['m1']);
  });
  it('are drawn on visible tracks only, and their effects count for the export notice', () => {
    const q = withAdj();
    expect(visualClipsAt(q, 7).map((c) => c.kind)).toEqual(['adjustment']);
    const hidden = setTrackFlags(q, 'v', { hidden: true });
    expect(visualClipsAt(hidden, 7)).toEqual([]);
    const glowing = { ...q, tracks: q.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.kind === 'adjustment' ? { ...c, effects: [glow] } : c)) })) };
    expect(skippedEffectTypes(glowing, ['glow'])).toEqual(['glow']);
    expect(skippedEffectTypes(setTrackFlags(glowing, 'v', { hidden: true }), ['glow'])).toEqual([]);
  });
  it('merge-all replaces them; a format change leaves them alone; lanes refuse them on audio', () => {
    const q = withAdj();
    expect(hiddenLayerClipCount(setTrackFlags(q, 'v', { hidden: true }))).toBe(2);
    const merged = replaceWithMedia(q, { id: 'mm', name: 'merged.mp4', kind: 'video', duration: 11, width: 1920, height: 1080, hasAudio: true });
    expect(adjustments(merged)).toEqual([]);
    const reframed = reframeProject(q, 'vertical');
    expect(adjustments(reframed)[0]).toEqual(adjustments(q)[0]);
    expect(laneRejects('audio', 'adjustment')).toBe('Adjustment layers go on a video track');
    expect(laneRejects('video', 'adjustment')).toBeNull();
  });
  it('trim like a source-less clip (the start moves either way) and split with new effect ids', () => {
    const q0 = withAdj();
    const q = addVideoEffect(q0, adjustments(q0)[0].id, 'bw');
    const a = adjustments(q)[0];
    const earlier = adjustments(trimClip(q, a.id, 'start', 5))[0];
    expect(earlier).toMatchObject({ start: 5, in: 0 });
    expect(clipDuration(earlier)).toBeCloseTo(6);
    const parts = adjustments(splitClip(q, a.id, 8));
    expect(parts).toHaveLength(2);
    expect(parts[0].effects[0].id).not.toBe(parts[1].effects[0].id);
    expect(parts.every((c) => c.effects[0].type === 'bw')).toBe(true);
  });
  it('has a name of its own', () => {
    expect(ADJUSTMENT_LABEL).toBe('Adjustment layer');
    expect(newAdjustmentClip(2, 3)).toMatchObject({ kind: 'adjustment', start: 2, out: 3, mediaId: '' });
  });
});

describe('migration (current data version)', () => {
  const saved = (clip: Record<string, unknown>, kind = 'video'): unknown => ({
    version: CURRENT_VERSION, format: { width: 1920, height: 1080, fps: 30 }, media: {},
    tracks: [{ id: 't', kind, name: '', hidden: false, muted: false, solo: false, locked: false, volume: 1, duck: null, clips: [clip] }],
  });
  const raw = {
    id: 'adj', kind: 'adjustment', mediaId: 'zzz', start: 0, in: 0, out: 2, volume: 1, fit: 'blur', future: 7,
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 0.5 }, blend: 'screen',
    effects: [{ id: 'e1', type: 'bw', enabled: true, params: {} }, { id: 'e2', type: 'nope', enabled: true, params: {} }],
    overlay: { type: 'sticker' },
  };
  it('keeps an adjustment clip with repaired fields and unknown extra keys; the current version stays current', () => {
    const r = migrateProject(saved(raw));
    if (!r.ok) throw new Error('refused');
    expect(r.project.version).toBe(CURRENT_VERSION);
    const [c] = r.project.tracks[0].clips;
    expect(c).toMatchObject({ kind: 'adjustment', mediaId: '', fit: 'fit', blend: 'screen', future: 7 });
    expect(c.effects.map((e) => e.type)).toEqual(['bw']);
    expect(c.overlay).toBeUndefined();
    const again = migrateProject(r.project);
    expect(again.ok && again.project).toEqual(r.project);
  });
  it('drops an adjustment clip on an audio track', () => {
    const r = migrateProject(saved(raw, 'audio'));
    expect(r.ok && r.project.tracks[0].clips).toEqual([]);
  });
});

describe('addAdjustmentCmd', () => {
  const state = () => useEditor.getState();
  beforeEach(() => {
    state().loadProject(base());
    useToasts.setState({ toasts: [] });
  });
  it('adds one adjustment layer at the playhead in ONE undo step and selects it', () => {
    state().setPlayhead(6);
    state().setActiveTrack('v');
    addAdjustmentCmd();
    expect(state().history.past.length).toBe(1);
    const [a] = adjustments(state().history.present);
    expect(a.start).toBe(6);
    expect(state().selection).toEqual([a.id]);
    state().undo();
    expect(adjustments(state().history.present)).toEqual([]);
  });
  it('a locked layer refuses with a toast and no step', () => {
    state().loadProject(setTrackFlags(base(), 'v', { locked: true }));
    state().setActiveTrack('v');
    addAdjustmentCmd();
    expect(state().history.past.length).toBe(0);
    expect(useToasts.getState().toasts.map((t) => t.message)).toContain('Track is locked');
  });
});
