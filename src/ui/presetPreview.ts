// Preset browser tiles (Plan 5B D10, Q12): what a tile shows is drawn by the SAME resolver as a clip. A synthetic
// card clip (a 16:9 card at 60 % of the tile, centred) carries the preset in its slot; resolveClip gives the drawn
// transform at the tile's time and clipCorners (the handles' geometry) its quad. Pure and DOM-free: the tile component
// only paints the quad. No video decode, no WebGL context.
import { resolveClip } from '../core/animate';
import { defaultClipAudio } from '../core/model';
import type { Clip } from '../core/model';
import type { MotionSlot, PresetKey, PresetUse } from '../core/motionTypes';
import { PRESET_SCHEMA, presetEase, presetParams } from '../core/presets';
import { clipCorners } from '../render/overlayGeometry';
import type { Point } from '../render/overlayGeometry';

/** The tile as a project format (CSS px of the tile canvas), and its frame rate (the tile animation's grid). */
export const TILE = { width: 120, height: 68, fps: 30 } as const;
/** The card: 60 % of the tile's width, 16:9. */
export const CARD = { width: TILE.width * 0.6, height: (TILE.width * 0.6 * 9) / 16 } as const;
/** Seconds of rest after (in, emphasis) or before (out) the preset's window in each preview loop. */
export const REST = 0.4;
/** Where an emphasis starts in its preview (a short rest first). */
const LEAD = 0.2;
/** How much of an entrance / exit window has passed at the still frame (on the way, still on the tile). */
const STILL_IN = 0.4;
const STILL_OUT = 0.6;
/** Samples searched for the most telling frame of an emphasis or loop preview. */
const SAMPLES = 48;

const windowOf = (key: PresetKey): number => PRESET_SCHEMA[key].duration;

/** The card clip's length for the preset (one preview loop). */
export function previewLength(key: PresetKey, slot: MotionSlot): number {
  const d = windowOf(key);
  if (slot === 'loop') return key === 'kenBurns' ? 3 : Math.min(6, Math.max(2 * d, 1.5));
  return (slot === 'emphasis' ? LEAD : 0) + d + REST;
}

/** The synthetic card clip: an image at rest in the tile's centre with the preset (slot defaults) in `slot`. */
export function cardClip(key: PresetKey, slot: MotionSlot): Clip {
  const use: PresetUse & { at?: number; phase?: number; count?: number | null } = {
    preset: key, duration: windowOf(key), delay: 0, ease: presetEase(key, slot), params: presetParams(key, slot),
  };
  if (slot === 'emphasis') use.at = LEAD;
  if (slot === 'loop') Object.assign(use, { phase: 0, count: null });
  return {
    id: `preview-${slot}-${key}`, mediaId: '', kind: 'image', start: 0, in: 0, out: previewLength(key, slot),
    transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 },
    volume: 1, fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal',
    motion: { [slot]: use },
  };
}

/** The card's drawn quad (tile px, clockwise from top-left) and opacity at tile time `t`. */
export function previewFrame(key: PresetKey, slot: MotionSlot, t: number, size: { width: number; height: number } = TILE): { corners: Point[]; opacity: number } {
  const drawn = resolveClip(cardClip(key, slot), t, { width: size.width, height: size.height, fps: TILE.fps }).transform;
  const card = { width: size.width * 0.6, height: (size.width * 0.6 * 9) / 16 };
  return { corners: clipCorners(card, drawn, size), opacity: drawn.opacity };
}

/** The card's drawn quad at tile time `t` (D10: corners via resolveClip + clipCorners). */
export function previewCorners(key: PresetKey, slot: MotionSlot, t: number, size: { width: number; height: number } = TILE): Point[] {
  return previewFrame(key, slot, t, size).corners;
}

const REST_FRAME = clipCorners(CARD, { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, TILE);
/** How far a frame is from rest: corner travel (tile px) plus opacity change (weighted: a blink frame is telling). */
function away(f: { corners: Point[]; opacity: number }): number {
  return f.corners.reduce((s, c, i) => s + Math.hypot(c.x - REST_FRAME[i].x, c.y - REST_FRAME[i].y), 0) + 100 * Math.abs(1 - f.opacity);
}

const stills = new Map<string, number>();
/**
 * The time of the still frame an unhovered (or reduced-motion) tile shows: an entrance 40 % of the way in, an exit
 * 60 % of the way out (on the move, still on the tile); an emphasis or loop at its frame furthest from rest (the first
 * of equals among 48 samples; the card's top edge is marked, so a half turn shows).
 */
export function stillTime(key: PresetKey, slot: MotionSlot): number {
  const d = windowOf(key);
  if (slot === 'in') return STILL_IN * d;
  if (slot === 'out') return REST + STILL_OUT * d;
  const id = `${slot}:${key}`;
  const known = stills.get(id);
  if (known !== undefined) return known;
  const len = previewLength(key, slot);
  let best = 0;
  let score = -1;
  for (let i = 0; i < SAMPLES; i++) {
    const t = (len * i) / SAMPLES;
    const s = away(previewFrame(key, slot, t));
    if (s > score + 1e-9) { score = s; best = t; }
  }
  stills.set(id, best);
  return best;
}

/** The tile time `elapsedMs` after the animation started: looped over the preview and snapped to the 30 fps grid. */
export function tileTime(key: PresetKey, slot: MotionSlot, elapsedMs: number): number {
  const len = previewLength(key, slot);
  const frames = Math.max(1, Math.floor(len * TILE.fps + 1e-9));
  const f = Math.floor((Math.max(0, elapsedMs) / 1000) * TILE.fps + 1e-9) % frames;
  return f / TILE.fps;
}
