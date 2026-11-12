// Plan 5 Task 4: keyframes through clip operations (D3, D9, §3.3): split/trim keep every frame identical, reframe
// scales keys and round-trips (Ruling J), fit/Reset clear keys, detach gives the twin none, clones never share keys.
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveClip } from '../src/core/animate';
import { detachAudio } from '../src/core/audioEdits';
import { cloneVideoEffects } from '../src/core/clipEffects';
import { splitKeys } from '../src/core/keyLists';
import { valueAt } from '../src/core/keyframes';
import { joinClips, reframeProject } from '../src/core/merge';
import { clipEnd, isSourceless } from '../src/core/model';
import type { Clip, Project, TransformKeys } from '../src/core/model';
import { deleteClip, moveClip, splitClip, trimClip } from '../src/core/timeline';
import { applyLook } from '../src/core/videoEffectEdits';
import { useEditor } from '../src/state/store';
import { setClipFit } from '../src/ui/edits';
import { resetClipTransform } from '../src/ui/transformEdits';
import { clipOf, colourFx, k, mk, pk, project, randomEase, randomTimes, rng } from './keyframe-fixtures';

const FPS = 30;
const close = (a: Clip, b: Clip, where: string) => {
  for (const key of ['x', 'y', 'scale', 'rotation', 'opacity'] as const) {
    expect(Math.abs(a.transform[key] - b.transform[key]), `${where} ${key}`).toBeLessThanOrEqual(1e-9);
  }
  a.effects.forEach((e, i) => {
    for (const p of Object.keys(e.params)) expect(Math.abs(e.params[p] - b.effects[i].params[p]), `${where} ${p}`).toBeLessThanOrEqual(1e-9);
  });
};
const withClip = (c: Clip): Project => {
  const p = project();
  return { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, clips: [c] } : t)) };
};
const halves = (p: Project): [Clip, Clip] => p.tracks[0].clips as [Clip, Clip];

/** A random animated clip: sourced (video/image) or sourceless (overlay/adjustment), random keys and eases. */
function randomClip(r: () => number): Clip {
  const kinds = ['video', 'image', 'overlay', 'adjustment'] as const;
  const kind = kinds[Math.floor(r() * 4)];
  const sourceless = kind === 'overlay' || kind === 'adjustment';
  const start = Math.round(r() * 2000) / 100 + r() * 0.01;
  const inn = sourceless ? 0 : Math.round(r() * 500) / 100;
  const dur = 1 + Math.round(r() * 400) / 100;
  const lo = (sourceless ? 0 : inn) - 1;
  const hi = (sourceless ? 0 : inn) + dur + 1;
  const list = (vals: () => number) => randomTimes(r, lo, hi).map((t) => k(t, vals(), randomEase(r)));
  const keys: TransformKeys = { opacity: list(() => r()) };
  if (kind !== 'adjustment') {
    keys.scale = list(() => 0.1 + r() * 3);
    keys.rotation = list(() => r() * 1440 - 720);
    keys.position = randomTimes(r, lo, hi).map((t) => pk(t, r() * 2000 - 1000, r() * 2000 - 1000, randomEase(r)));
  }
  const effects = kind === 'overlay' ? [] : [colourFx('fx', { keys: { brightness: list(() => r() * 2 - 1), hue: list(() => r() * 360 - 180) } })];
  return mk('c', {
    kind, mediaId: sourceless ? '' : 'm1', start, in: inn, out: inn + dur, effects, keys,
    overlay: kind === 'overlay' ? { type: 'sticker', text: '', subtext: '', colour: '#ffffff', accent: '#000000', sticker: 'star' } : undefined,
  });
}

/** Every project frame time n/fps inside [from, to). */
const frames = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let n = Math.ceil(from * FPS - 1e-9); n / FPS < to - 1e-9; n++) out.push(n / FPS);
  return out;
};

describe('splitClip with keys (D9)', () => {
  it('property: every frame of both halves resolves exactly as the original (300 random clips, frame-aligned cuts)', () => {
    const r = rng(42);
    for (let i = 0; i < 300; i++) {
      const c = randomClip(r);
      const dur = c.out - c.in;
      const nFrames = Math.floor(dur * FPS);
      const cutFrame = 2 + Math.floor(r() * (nFrames - 4));
      const time = c.start + cutFrame / FPS;
      const [left, right] = halves(splitClip(withClip(c), 'c', time));
      for (const t of frames(c.start, time)) close(resolveClip(left, t, FPS), resolveClip(c, t, FPS), `#${i} L t=${t}`);
      for (const t of frames(time, clipEnd(c))) close(resolveClip(right, t, FPS), resolveClip(c, t, FPS), `#${i} R t=${t}`);
    }
  });

  it('property: at ANY cut the halves keep the curve on their own local range (same footage frame, same value)', () => {
    const r = rng(9);
    for (let i = 0; i < 300; i++) {
      const c = randomClip(r);
      const time = c.start + 0.06 + r() * (c.out - c.in - 0.12);
      const [left, right] = halves(splitClip(withClip(c), 'c', time));
      const d = time - c.start;
      const base = isSourceless(c) ? 0 : c.in;
      for (let j = 0; j <= 50; j++) {
        const uL = base + (d * j) / 50;
        const uR = base + d + ((c.out - c.in - d) * j) / 50;
        const shift = isSourceless(c) ? d : 0;
        expect(Math.abs(valueAt(left.keys!.opacity!, uL) - valueAt(c.keys!.opacity!, uL))).toBeLessThanOrEqual(1e-9);
        expect(Math.abs(valueAt(right.keys!.opacity!, uR - shift) - valueAt(c.keys!.opacity!, uR))).toBeLessThanOrEqual(1e-9);
        const e = c.effects[0];
        if (e) expect(Math.abs(valueAt(right.effects[0].keys!.hue, uR - shift) - valueAt(e.keys!.hue, uR))).toBeLessThanOrEqual(1e-9);
      }
    }
  });

  it('keeps only the needed keys: in-range keys plus the nearest beyond each end', () => {
    const keys = [0.5, 1, 2, 3, 4, 5, 6, 7].map((t) => k(t, t));
    expect(splitKeys(keys, 2.5, 4.5).map((x) => x.t)).toEqual([2, 3, 4, 5]);
    expect(splitKeys(keys, 3, 4).map((x) => x.t)).toEqual([3, 4]);
    expect(splitKeys(keys, 8, 9).map((x) => x.t)).toEqual([7]);
    expect(splitKeys(keys, -2, 0).map((x) => x.t)).toEqual([0.5]);
    // Sourced clip in 2..6 (local), cut at local 4.5: left 2..4.5, right 4.5..6.
    const c = mk('c', { keys: { scale: keys }, effects: [colourFx('fx', { keys: { hue: keys } })] });
    const [left, right] = halves(splitClip(withClip(c), 'c', 12.5));
    expect(left.keys?.scale?.map((x) => x.t)).toEqual([2, 3, 4, 5]);
    expect(right.keys?.scale?.map((x) => x.t)).toEqual([4, 5, 6]);
    expect(left.effects[0].keys?.hue.map((x) => x.t)).toEqual([2, 3, 4, 5]);
    expect(right.effects[0].keys?.hue.map((x) => x.t)).toEqual([4, 5, 6]);
  });

  it('sourceless right half: keys shifted by −(split − start); left unchanged', () => {
    const c = mk('c', { kind: 'adjustment', mediaId: '', in: 0, out: 4, keys: { opacity: [k(0, 0), k(2, 1), k(4, 0)] } });
    const [left, right] = halves(splitClip(withClip(c), 'c', 11));
    expect(left.keys?.opacity).toEqual([k(0, 0), k(2, 1)]);
    expect(right.keys?.opacity).toEqual([k(-1, 0), k(1, 1), k(3, 0)]);
  });

  it('halves never share key arrays or key objects with each other or the original', () => {
    const c = mk('c', { keys: { scale: [k(1, 1), k(5, 2)] }, effects: [colourFx('fx', { keys: { hue: [k(1, 1), k(5, 2)] } })] });
    const [left, right] = halves(splitClip(withClip(c), 'c', 12));
    expect(left.keys!.scale).not.toBe(right.keys!.scale);
    expect(left.keys!.scale![0]).not.toBe(c.keys!.scale![0]);
    expect(left.effects[0].keys!.hue).not.toBe(right.effects[0].keys!.hue);
    expect(left.effects[0].keys!.hue[0]).not.toBe(right.effects[0].keys!.hue[0]);
  });

  it('a static clip splits exactly as before (no keys field appears)', () => {
    const [left, right] = halves(splitClip(withClip(mk('c', { effects: [colourFx()] })), 'c', 12));
    expect('keys' in left || 'keys' in right).toBe(false);
    expect('keys' in left.effects[0] || 'keys' in right.effects[0]).toBe(false);
  });
});

describe('trimClip with keys (D3, D9)', () => {
  it('property: frames inside the new range are unchanged (sourced and sourceless, start and end, frame-aligned)', () => {
    const r = rng(5);
    for (let i = 0; i < 200; i++) {
      const c = randomClip(r);
      const nFrames = Math.floor((c.out - c.in) * FPS);
      const sourceless = isSourceless(c);
      // Start trims: later (any kind), earlier (sourceless always; sourced only as far as `in` allows).
      const earliest = sourceless ? -Math.min(30, Math.floor(c.start * FPS)) : -Math.floor(c.in * FPS);
      const dStart = Math.max(earliest, Math.floor(r() * (nFrames - 4)) - 10);
      const t1 = c.start + dStart / FPS;
      const trimmed = trimClip(withClip(c), 'c', 'start', t1).tracks[0].clips[0];
      for (const t of frames(Math.max(t1, c.start), clipEnd(c))) close(resolveClip(trimmed, t, FPS), resolveClip(c, t, FPS), `#${i} start t=${t}`);
      const t2 = clipEnd(c) - Math.floor(r() * (nFrames - 4)) / FPS;
      const cut = trimClip(withClip(c), 'c', 'end', t2).tracks[0].clips[0];
      for (const t of frames(c.start, t2)) close(resolveClip(cut, t, FPS), resolveClip(c, t, FPS), `#${i} end t=${t}`);
      expect(cut.keys).toBe(c.keys);
    }
  });

  it('keys are kept even when outside the new range; sourced start trims leave them; sourceless shift by −Δ', () => {
    const sourced = mk('c', { keys: { scale: [k(2, 1), k(5, 2)] } });
    const t = trimClip(withClip(sourced), 'c', 'start', 13.5).tracks[0].clips[0];
    expect(t.keys).toBe(sourced.keys);
    const adj = mk('c', { kind: 'adjustment', mediaId: '', in: 0, out: 4, keys: { opacity: [k(0, 0), k(3, 1)] } });
    expect(trimClip(withClip(adj), 'c', 'start', 11).tracks[0].clips[0].keys).toEqual({ opacity: [k(-1, 0), k(2, 1)] });
    expect(trimClip(withClip(adj), 'c', 'start', 9).tracks[0].clips[0].keys).toEqual({ opacity: [k(1, 0), k(4, 1)] });
  });
});

describe('reframeProject with keys (D9, Ruling J)', () => {
  const keyed = () => withClip(mk('c', {
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    keys: { position: [pk(2, 300, -200), pk(4, -30, 45)], scale: [k(2, 3), k(4, 0.5)], rotation: [k(2, 400)] },
  }));
  it('scales position keys like x/y and scale keys like scale; a keyed clip at its fit is never refit', () => {
    const v = reframeProject(keyed(), 'vertical');
    const c = clipOf(v, 'c');
    const rx = 1080 / 1920;
    const ry = 1920 / 1080;
    expect(c.keys?.position?.[0].x).toBeCloseTo(300 * rx, 9);
    expect(c.keys?.position?.[0].y).toBeCloseTo(-200 * ry, 9);
    expect(c.keys?.scale?.[0].v).toBeCloseTo(3 * Math.sqrt(rx * ry), 9);
    expect(c.keys?.rotation).toEqual([k(2, 400)]);
    // Static values follow the customised rule (not the refit to 0.5625).
    expect(c.transform.scale).toBeCloseTo(Math.sqrt(rx * ry), 12);
  });
  it('round trip A → B → A restores keys within 1e-9 for every format pair', () => {
    const fmts = ['youtube', 'vertical', 'square', 'portrait'] as const;
    for (const a of fmts) for (const b of fmts) {
      if (a === b) continue;
      const p = a === 'youtube' ? keyed() : reframeProject(keyed(), a);
      const back = clipOf(reframeProject(reframeProject(p, b), a), 'c');
      const orig = clipOf(p, 'c');
      orig.keys!.position!.forEach((q, i) => {
        expect(Math.abs(back.keys!.position![i].x - q.x)).toBeLessThanOrEqual(1e-9);
        expect(Math.abs(back.keys!.position![i].y - q.y)).toBeLessThanOrEqual(1e-9);
      });
      orig.keys!.scale!.forEach((q, i) => expect(Math.abs(back.keys!.scale![i].v - q.v)).toBeLessThanOrEqual(1e-9));
    }
  });
  it('an overlay with position keys counts as customised: keys scale with the format, scale keys stay', () => {
    const p = project();
    const o0 = clipOf(p, 'o');
    const q = { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, clips: t.clips.map((c) => (c.id === 'o' ? { ...c, keys: { position: [pk(0, 100, 100)], scale: [k(0, 2)] } } : c)) } : t)) };
    const v = clipOf(reframeProject(q, 'square'), 'o');
    expect(v.keys?.position?.[0].x).toBeCloseTo(100 * 1080 / 1920, 9);
    expect(v.keys?.position?.[0].y).toBeCloseTo(100, 9);
    expect(v.keys?.scale).toEqual([k(0, 2)]);
    expect(v.transform.x).toBeCloseTo(o0.transform.x * 1080 / 1920, 9);
    const back = clipOf(reframeProject(reframeProject(q, 'square'), 'youtube'), 'o');
    expect(Math.abs(back.keys!.position![0].x - 100)).toBeLessThanOrEqual(1e-9);
    // Without keys the same overlay sits at its default and refits there.
    expect(clipOf(reframeProject(p, 'square'), 'o').keys).toBeUndefined();
  });
});

describe('fit, Reset, detach, clone, look, move', () => {
  beforeEach(() => useEditor.getState().loadProject(project()));
  const full: TransformKeys = { position: [pk(2, 1, 1)], scale: [k(2, 2)], rotation: [k(2, 30)], opacity: [k(2, 0.5)] };

  it('setClipFit removes position and scale keys (rotation and opacity keys stay); one undo restores them', () => {
    useEditor.getState().loadProject(project({ keys: full }));
    const before = useEditor.getState().history.present;
    useEditor.getState().apply((p) => setClipFit(p, 'c', 'fill'));
    expect(clipOf(useEditor.getState().history.present, 'c').keys).toEqual({ rotation: full.rotation, opacity: full.opacity });
    useEditor.getState().undo();
    expect(useEditor.getState().history.present).toBe(before);
    // Same fit: no change, keys kept.
    const p = project({ keys: full });
    expect(setClipFit(p, 'c', 'fit')).toBe(p);
  });

  it('resetClipTransform removes every transform key; one undo restores them; adjustment Reset stays a no-op', () => {
    useEditor.getState().loadProject(project({ keys: full }));
    const before = useEditor.getState().history.present;
    useEditor.getState().apply((p) => resetClipTransform(p, 'c'));
    expect('keys' in clipOf(useEditor.getState().history.present, 'c')).toBe(false);
    useEditor.getState().undo();
    expect(JSON.stringify(useEditor.getState().history.present)).toBe(JSON.stringify(before));
    // A clip at its fit with keys still changes (the keys go).
    const p = project({ keys: { opacity: [k(2, 0.5)] } });
    expect('keys' in clipOf(resetClipTransform(p, 'c'), 'c')).toBe(false);
    const adj = project();
    const q = { ...adj, tracks: adj.tracks.map((t) => (t.id === 'v' ? { ...t, clips: t.clips.map((c) => (c.id === 'adj' ? { ...c, keys: { opacity: [k(0, 0.2)] } } : c)) } : t)) };
    expect(resetClipTransform(q, 'adj')).toBe(q);
  });

  it('detachAudio: the audio twin carries no keys; the video keeps its keys', () => {
    const p = project({ keys: full, effects: [colourFx('fx', { keys: { hue: [k(2, 1)] } })] });
    const q = detachAudio(p, 'c');
    const twin = q.tracks.filter((t) => t.kind === 'audio').flatMap((t) => t.clips).find((c) => c.id !== 'ac')!;
    expect(twin.kind).toBe('audio');
    expect('keys' in twin).toBe(false);
    expect(twin.effects).toEqual([]);
    expect(clipOf(q, 'c').keys).toBe(full);
  });

  it('cloneVideoEffects gives independent key arrays (mutating one leaves the other)', () => {
    const src = [colourFx('fx', { keys: { hue: [k(1, 1, { kind: 'bezier', bezier: [0, 0, 1, 1] })] } })];
    const [copy] = cloneVideoEffects(src);
    expect(copy.keys).toEqual(src[0].keys);
    copy.keys!.hue.push(k(2, 2));
    copy.keys!.hue[0].v = 9;
    copy.keys!.hue[0].ease.bezier![0] = 0.5;
    expect(src[0].keys!.hue).toEqual([k(1, 1, { kind: 'bezier', bezier: [0, 0, 1, 1] })]);
    expect('keys' in cloneVideoEffects([colourFx()])[0]).toBe(false);
  });

  it('applyLook drops old effect keys, also when the stack already has the look shape', () => {
    const q = applyLook(project({ effects: [] }), 'c', 'bw');
    expect(applyLook(q, 'c', 'bw')).toBe(q);
    const bw = clipOf(q, 'c').effects[0];
    const keyed = project({ effects: [{ ...bw, keys: { amount: [k(2, 0), k(4, 1)] } }] });
    const r = applyLook(keyed, 'c', 'bw');
    expect(r).not.toBe(keyed);
    expect('keys' in clipOf(r, 'c').effects[0]).toBe(false);
    expect(clipOf(applyLook(project({ effects: [colourFx('fx', { keys: { hue: [k(2, 10)] } })] }), 'c', 'sepia'), 'c').effects.every((e) => !('keys' in e))).toBe(true);
  });

  it('move, ripple delete and join leave keys untouched (same objects)', () => {
    const c = mk('c', { keys: full });
    const p = { ...withClip(c), tracks: withClip(c).tracks.map((t) => (t.id === 'v' ? { ...t, clips: [c, mk('d', { start: 20, keys: full })] } : t)) };
    expect(clipOf(moveClip(p, 'c', 3), 'c').keys).toBe(full);
    expect(clipOf(deleteClip(p, 'c', { ripple: true }), 'd').keys).toBe(full);
    const j = joinClips(p, ['c', 'd']);
    expect(clipOf(j, 'c').keys).toBe(full);
    expect(clipOf(j, 'd').keys).toBe(full);
  });
});
