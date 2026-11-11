import { useEffect, useRef, useState } from 'react';
import type { Clip, Id } from '../core/model';
import { getPeaks, peakAt } from '../media/peaks';
import type { Peaks } from '../media/peaks';

const MAX_BACKING_PX = 8192;

/** Draws the clip's [in, out) slice of the media's peaks; nothing while loading or when peaks are unavailable. */
export default function Waveform({ clip, mediaId, width }: { clip: Clip; mediaId: Id; width: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Peaks | null>(null);

  useEffect(() => {
    let live = true;
    setPeaks(null);
    void getPeaks(mediaId).then((p) => live && setPeaks(p));
    return () => {
      live = false;
    };
  }, [mediaId]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const cssW = Math.max(1, Math.round(width));
    const cssH = Math.max(1, canvas.clientHeight || 24);
    const dpr = window.devicePixelRatio || 1;
    const w = Math.min(MAX_BACKING_PX, Math.max(1, Math.round(cssW * dpr)));
    const h = Math.max(1, Math.round(cssH * dpr));
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgb(0 0 0 / 0.65)';
    const mid = h / 2;
    const span = clip.out - clip.in;
    for (let x = 0; x < w; x++) {
      const t0 = clip.in + (x / w) * span;
      const { min, max } = peakAt(peaks, t0, clip.in + ((x + 1) / w) * span);
      const top = mid - max * mid;
      const bottom = mid - min * mid;
      ctx.fillRect(x, top, 1, Math.max(1, bottom - top));
    }
  }, [peaks, width, clip.in, clip.out]);

  return (
    <canvas
      ref={ref}
      className={`clip-waveform clip-waveform-${clip.kind}`}
      data-testid="clip-waveform"
      aria-hidden="true"
    />
  );
}
