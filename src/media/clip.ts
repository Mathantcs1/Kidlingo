import { fitTransform } from '../core/merge';
import { defaultClipAudio, defaultTransform, newId } from '../core/model';
import type { Clip, Id, MediaRef } from '../core/model';

/** A clip spanning the whole media, fitted to the canvas. Track placement is the caller's job. */
export function clipFromMedia(
  m: MediaRef,
  _trackId: Id,
  start: number,
  canvas: { width: number; height: number },
): Clip {
  const transform =
    m.kind !== 'audio' && m.width && m.height
      ? fitTransform({ width: m.width, height: m.height }, canvas, 'fit')
      : defaultTransform();
  return {
    id: newId(),
    mediaId: m.id,
    kind: m.kind,
    start,
    in: 0,
    out: m.duration,
    transform,
    volume: 1,
    fit: 'fit',
    audio: defaultClipAudio(),
  };
}
