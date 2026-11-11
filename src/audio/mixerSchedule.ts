// Live mixer helpers (see mixer.ts): decoding a window's segments and the clock maths of one scheduled piece.
import { decodeAudioRange } from '../media/audioDecode';
import type { DecodedAudio } from '../media/audioDecode';
import { prepareSource } from './denoiseSource';
import { chainLatency, chainMargins } from './effects/params';
import type { Margins } from './effects/params';
import { planWindow } from './plan';
import type { Segment } from './plan';
import type { Session } from './mixerTypes';

/** Real source audio decoded past each window cut, so resampling at the cut sees its true neighbours. */
const CUT_MARGIN = 0.05;

/** One decoded segment and the effect margins its buffer covers (pre 0 when the pre-roll was not decoded). */
export interface Piece {
  seg: Segment;
  decoded: DecodedAudio;
  margins: Margins;
}

/**
 * Decodes the window's segments plus cut margins and, when `warm`, the effects' pre-roll / post-roll (D7). The
 * first window after Play is decoded cold (pre 0): its pre-roll would lie before the play position, in the past,
 * so decoding it (up to MAX_PRE_ROLL) would only delay the start. Returns [] once `current()` turns false.
 */
export async function decodePieces(
  s: Session,
  [a, b]: [number, number],
  warm: boolean,
  current: () => boolean,
): Promise<Piece[]> {
  const out: Piece[] = [];
  for (const seg of planWindow(s.clips, a, b, s.trackVolumes, s.duckPoints)) {
    const { clip } = seg;
    const m = chainMargins(clip.audio.effects);
    const margins = { pre: warm ? m.pre : 0, post: m.post };
    let decoded: DecodedAudio | null;
    try {
      const from = Math.max(clip.in, seg.srcFrom - CUT_MARGIN - margins.pre);
      const to = Math.min(clip.out, seg.srcTo + CUT_MARGIN + margins.post);
      decoded = await decodeAudioRange(seg.mediaId, from, to, s.ctx, s.abort.signal);
    } catch (e) {
      if (!current()) return [];
      const name = s.names.get(seg.mediaId) ?? seg.mediaId;
      throw new Error(`Could not read the audio of "${name}": ${e instanceof Error ? e.message : String(e)}`);
    }
    if (!current()) return [];
    if (!decoded) continue;
    const buffer = await prepareSource(clip, decoded, s.ctx);
    if (!current()) return [];
    out.push({ seg, decoded: { ...decoded, buffer }, margins });
  }
  return out;
}

/** Clock maths of one piece: buffer `offset` plays at context time `when` for `duration`; see pieceTiming. */
export interface Timing {
  start: number;
  end: number;
  when: number;
  offset: number;
  duration: number;
  /** Seconds of the segment itself (not its pre-roll) cut because they were already in the past. */
  late: number;
}

/**
 * Source [srcFrom, srcTo) of the buffer at its exact clock time (sub-sample offsets). With effects the decoded
 * pre-roll plays before and the post-roll after (the chain's seam gate silences both), so effects enter the segment
 * warmed up. Pre-roll that is already in the past is skipped as late, so pre-roll longer than the live look-ahead
 * (one window) starts cold; export is always exact. A pitch-shifted chain is fed chainLatency earlier, as in export.
 */
export function pieceTiming(s: Session, { seg, decoded, margins }: Piece, now: number): Timing {
  const start = s.ctxStart + (seg.when - s.from);
  const end = start + (seg.srcTo - seg.srcFrom);
  // Buffer time of srcFrom / srcTo (decoded.start is within half a sample of the requested start).
  const lead = seg.srcFrom - decoded.start;
  // Seconds played before srcFrom: all decoded pre-roll with effects (negative if the buffer starts after srcFrom).
  const roll = lead < 0 || margins.pre > 0 ? lead : 0;
  const latency = chainLatency(seg.clip.audio.effects, s.ctx.sampleRate);
  let offset = lead - roll;
  let when = start - roll - latency;
  const late = Math.max(0, now - when);
  when += late;
  offset += late;
  const duration = lead + (seg.srcTo - seg.srcFrom) + margins.post - offset;
  return { start, end, when, offset, duration, late: Math.max(0, late - Math.max(0, roll) - latency) };
}
