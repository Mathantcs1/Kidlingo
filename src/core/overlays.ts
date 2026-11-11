// Overlay clips (data v5): their size and default place in format pixels, placement on the timeline, spec edits. Pure.
import { defaultClipAudio, newId } from './model';
import type { Clip, Id, OverlaySpec, OverlayType, Project, Transform } from './model';
import { MIN_CLIP, TimelineError, addClip, assertUnlocked, findClip, hasRoom } from './timeline';
import { addTrack } from './tracks';
import {
  DEFAULT_OVERLAY_DURATION, OVERLAY_LABELS, STICKER_LABELS, cutText, hexColour, isOverlayType, isStickerKind, overlayDefaults,
} from './overlaySpec';

type Format = { width: number; height: number };

/** The overlay's own size in format px at scale 1: proportional to the format's short side; the bar spans the width. */
export function overlayBaseSize(type: OverlayType, f: Format): Format {
  const u = Math.min(f.width, f.height);
  const box = (w: number, h: number): Format => ({ width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)) });
  switch (type) {
    case 'lowerThird': return box(0.8 * u, 0.2 * u);
    case 'subscribe': return box(0.4 * u, 0.11 * u);
    case 'progressBar': return box(f.width, 0.025 * u);
    case 'sticker': return box(0.3 * u, 0.3 * u);
  }
}

/** Lower thirds bottom-left, subscribe bottom-right, the progress bar on the bottom edge, stickers centred. */
export function overlayDefaultTransform(type: OverlayType, f: Format): Transform {
  const { width: w, height: h } = overlayBaseSize(type, f);
  const m = 0.06 * Math.min(f.width, f.height);
  const W = f.width / 2;
  const H = f.height / 2;
  const at = (x: number, y: number): Transform => ({ x, y, scale: 1, rotation: 0, opacity: 1 });
  switch (type) {
    case 'lowerThird': return at(-W + m + w / 2, H - 1.5 * m - h / 2);
    case 'subscribe': return at(W - m - w / 2, H - m - h / 2);
    case 'progressBar': return at(0, H - h / 2);
    case 'sticker': return at(0, 0);
  }
}

/** A new overlay clip: no media, no effects, normal blend, default spec and placement. Track placement is the caller's. */
export function newOverlayClip(type: OverlayType, start: number, duration: number, f: Format): Clip {
  return {
    id: newId(), mediaId: '', kind: 'overlay', start, in: 0, out: duration,
    transform: overlayDefaultTransform(type, f), volume: 1, fit: 'fit', audio: defaultClipAudio(), effects: [], blend: 'normal',
    overlay: overlayDefaults(type),
  };
}

/** "Lower third", "Sticker: Fire": how the editor names an overlay clip (it has no media name). */
export function overlayLabel(c: Clip): string {
  const s = c.overlay;
  if (!s) return 'Overlay';
  return s.type === 'sticker' && s.sticker ? `${OVERLAY_LABELS.sticker}: ${STICKER_LABELS[s.sticker]}` : OVERLAY_LABELS[s.type];
}

/**
 * Adds an overlay of `type` at `start` (clamped to ≥ 0) lasting `duration` s on the video track `trackId` when it has
 * room there, else on a new video layer above the others (ONE returned project). A locked target is refused, not
 * bypassed; the per-kind layer limit applies.
 */
export function addOverlayClip(p: Project, trackId: Id, type: OverlayType, start: number, duration = DEFAULT_OVERLAY_DURATION): Project {
  if (!isOverlayType(type)) throw new TimelineError(`Unknown overlay: ${type}`);
  if (!Number.isFinite(start)) throw new TimelineError('Invalid clip position');
  if (!Number.isFinite(duration) || duration < MIN_CLIP) throw new TimelineError('Invalid overlay duration');
  const track = p.tracks.find((t) => t.id === trackId);
  if (!track) throw new TimelineError(`Track not found: ${trackId}`);
  if (track.kind !== 'video') throw new TimelineError('Overlays go on a video track');
  assertUnlocked(p, trackId);
  const clip = newOverlayClip(type, Math.max(0, start), duration, p.format);
  if (hasRoom(track, clip)) return addClip(p, trackId, clip);
  const q = addTrack(p, 'video');
  const added = q.tracks.find((t) => !p.tracks.some((o) => o.id === t.id));
  if (!added) throw new TimelineError('Could not add a track');
  return addClip(q, added.id, clip);
}

export type OverlayPatch = Partial<Pick<OverlaySpec, 'text' | 'subtext' | 'colour' | 'accent' | 'sticker'>>;

/** Changes an overlay's text, colours or sticker (text cut to 80 code points); `p` itself when nothing changes. */
export function updateOverlay(p: Project, clipId: Id, patch: OverlayPatch): Project {
  const { track, clip } = findClip(p, clipId);
  assertUnlocked(p, track.id);
  const cur = clip.overlay;
  if (clip.kind !== 'overlay' || !cur) throw new TimelineError('Not an overlay');
  const next: OverlaySpec = { ...cur };
  for (const key of ['text', 'subtext'] as const) {
    const v = patch[key];
    if (v !== undefined) next[key] = cutText(String(v));
  }
  for (const key of ['colour', 'accent'] as const) {
    const v = patch[key];
    if (v === undefined) continue;
    const hex = hexColour(v);
    if (!hex) throw new TimelineError(`Invalid colour: ${v}`);
    next[key] = hex;
  }
  if (patch.sticker !== undefined) {
    if (cur.type !== 'sticker') throw new TimelineError('Only stickers have a sticker');
    if (!isStickerKind(patch.sticker)) throw new TimelineError(`Unknown sticker: ${patch.sticker}`);
    next.sticker = patch.sticker;
  }
  const same = (Object.keys(next) as (keyof OverlaySpec)[]).every((k) => next[k] === cur[k]);
  if (same) return p;
  return { ...p, tracks: p.tracks.map((t) => ({ ...t, clips: t.clips.map((c) => (c.id === clipId ? { ...c, overlay: next } : c)) })) };
}

const SAME = 1e-6;

/**
 * An overlay clip after a format change from `old` to `next`: one still at its type's default place (x, y, scale within
 * 1e-6) moves to the new default; a customised one keeps its relative position (x·w′/w, y·h′/h) and its scale (its size
 * already follows the format). Rotation and opacity are kept.
 */
export function reframeOverlay(c: Clip, old: Format, next: Format): Clip {
  if (!c.overlay) return { ...c };
  const t = c.transform;
  const d = overlayDefaultTransform(c.overlay.type, old);
  const atDefault = (['x', 'y', 'scale'] as const).every((k) => Math.abs(t[k] - d[k]) <= SAME);
  if (atDefault) {
    const { x, y, scale } = overlayDefaultTransform(c.overlay.type, next);
    return { ...c, transform: { ...t, x, y, scale } };
  }
  return { ...c, transform: { ...t, x: t.x * (next.width / old.width), y: t.y * (next.height / old.height) } };
}
