// Shared fixtures for the animation-stack clip-operation tests (Plan 5B Task 5, D12): frame-exact comparison of two
// resolved clips, a project holding one clip, the frame grid, and random stacks with a cut outside every window.
import { expect } from 'vitest';
import { localTime } from '../src/core/keyframes';
import type { Clip, Project } from '../src/core/model';
import { motionWindows } from '../src/core/motion';
import type { ClipMotion, MotionSlot, PresetKey, PresetUse } from '../src/core/motionTypes';
import { PRESETS, PRESET_SCHEMA, presetEase, presetsForSlot } from '../src/core/presets';
import { mk, project } from './keyframe-fixtures';

export const FPS = 30;
export const FMT = { width: 1920, height: 1080, fps: FPS };
const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
/** Rotations compare modulo whole turns (Spin 360 / Spin loop wrap at half a cycle: ±180·T is the same picture). */
const turn = (d: number): number => {
  const m = ((d % 360) + 360) % 360;
  return m > 360 - 1e-7 ? 0 : m;
};
export function same(a: Clip, b: Clip, where: string): void {
  for (const key of ['x', 'y', 'scale', 'opacity'] as const) {
    expect(near(a.transform[key], b.transform[key]), `${where} ${key} ${a.transform[key]} vs ${b.transform[key]}`).toBe(true);
  }
  const [ra, rb] = [turn(a.transform.rotation), turn(b.transform.rotation)];
  expect(Math.abs(ra - rb) < 1e-7 || Math.abs(Math.abs(ra - rb) - 360) < 1e-7, `${where} rotation ${a.transform.rotation} vs ${b.transform.rotation}`).toBe(true);
}
export const withClip = (c: Clip): Project => {
  const p = project();
  return { ...p, tracks: p.tracks.map((t) => (t.id === 'v' ? { ...t, clips: [c] } : t)) };
};
export const frames = (from: number, to: number): number[] => {
  const out: number[] = [];
  for (let n = Math.ceil(from * FPS - 1e-9); n / FPS < to - 1e-9; n++) out.push(n / FPS);
  return out;
};
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
function randomUse(r: () => number, slot: MotionSlot, adjustment: boolean): PresetUse {
  const keys = presetsForSlot(slot).filter((key) => (!adjustment || PRESETS[key].opacityOnly) && key !== 'kenBurns');
  const preset: PresetKey = pick(r, keys);
  const params = Object.fromEntries(PRESET_SCHEMA[preset].params.map((d) => {
    const v = d.min + r() * (d.max - d.min);
    return [d.key, d.integer ? Math.round(v) : v];
  }));
  const ease = r() < 0.5 ? presetEase(preset, slot) : pick(r, [{ kind: 'linear' }, { kind: 'easeInOut' }, { kind: 'back' }, { kind: 'spring', spring: { stiffness: 200, damping: 6, mass: 1 } }] as const);
  return { preset, duration: 0.2 + Math.round(r() * 40) / 100, delay: Math.round(r() * 20) / 100, ease: { ...ease }, params };
}

/**
 * A random clip whose stack fits (no short-clip scaling) with a frame-aligned cut outside every window (a cut exactly
 * at the emphasis start is allowed). `aligned`: the emphasis `at` is the local time of a playhead frame (as setPreset
 * stores it), and half the time the cut is that very frame.
 */
export function randomCase(r: () => number, aligned = false): { clip: Clip; n: number } {
  const kind = pick(r, ['video', 'image', 'overlay', 'adjustment'] as const);
  const sourceless = kind === 'overlay' || kind === 'adjustment';
  const start = Math.round(r() * 2000) / 100 + r() * 0.01;
  const inn = sourceless ? 0 : Math.round(r() * 500) / 100;
  const dur = 2.5 + Math.round(r() * 300) / 100;
  const adj = kind === 'adjustment';
  const m: ClipMotion = {};
  if (r() < 0.8) m.in = randomUse(r, 'in', adj);
  if (r() < 0.8) m.out = randomUse(r, 'out', adj);
  const shell = mk('c', { kind, mediaId: sourceless ? '' : 'm1', start, in: inn, out: inn + dur, ...(adj ? { effects: [] } : {}) });
  const atFrame = Math.floor(r() * dur * FPS);
  if (aligned || r() < 0.8) {
    const at = aligned ? localTime(shell, start + atFrame / FPS, FPS) : inn + Math.round(r() * dur * 100) / 100 - 0.2;
    m.emphasis = { ...randomUse(r, 'emphasis', adj), delay: 0, at };
  }
  if (r() < 0.9) m.loop = { ...randomUse(r, 'loop', adj), delay: 0, duration: 0.1 + Math.round(r() * 150) / 100, phase: Math.round((r() * 6 - 3) * 100) / 100, count: r() < 0.5 ? null : 1 + Math.floor(r() * 4) };
  const clip = { ...shell, motion: m };
  const w = motionWindows(clip);
  const lo = w.in ? w.in.end : 0.1;
  const hi = w.out ? w.out.start : dur - 0.1;
  const options: number[] = [];
  for (let n = Math.ceil(Math.max(lo, 0.1) * FPS); n / FPS <= Math.min(hi, dur - 0.1); n++) {
    const local = (sourceless ? 0 : inn) + n / FPS;
    if (m.emphasis && m.emphasis.at < local - 1e-9 && m.emphasis.at + m.emphasis.duration > local + 1e-9) continue;
    options.push(n);
  }
  if (options.length === 0) return randomCase(r, aligned);
  return { clip, n: aligned && options.includes(atFrame) && r() < 0.5 ? atFrame : pick(r, options) };
}
