import { useEffect, useRef, useState } from 'react';
import type { Id } from '../core/model';
import { setTrackVolumeCmd } from './audioCommands';
import './audio.css';

/**
 * Track level 0–200 %: follows the slider live as a local draft; the project changes ONCE on the native `change`
 * event (pointer release, or each key press), so a drag is one undo step. Works on locked tracks (mixer state).
 */
export default function TrackVolume({ trackId, volume, label }: { trackId: Id; volume: number; label: string }) {
  const [draft, setDraft] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const percent = draft ?? Math.round(volume * 100);
  useEffect(() => setDraft(null), [trackId, volume]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const commit = (): void => {
      setTrackVolumeCmd(trackId, Number(el.value) / 100);
      setDraft(null);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [trackId]);
  return (
    <input
      ref={ref}
      type="range"
      className="track-volume"
      min={0}
      max={200}
      step={1}
      value={percent}
      data-testid={`track-volume-${trackId}`}
      aria-label={`Volume of ${label}`}
      aria-valuetext={`${percent} percent`}
      title={`Volume ${percent}%`}
      onChange={(e) => setDraft(Number(e.target.value))}
    />
  );
}
