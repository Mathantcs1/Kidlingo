import { useEffect, useRef, useState } from 'react';
import type { Clip } from '../core/model';
import { LOOKS, LOOK_KEYS } from '../fx/looks';
import { lookPixel } from '../fx/reference';
import { applyClipLook, updateClipFx } from './fxCommands';

const grey = (v: number): [number, number, number] => [v, v, v];
const css = (c: number[]): string => `rgb(${c.map((v) => Math.round(v * 255)).join(',')})`;
/** A swatch of what the look does to shadows, mids and highlights. */
const SWATCH = Object.fromEntries(
  LOOK_KEYS.map((k) => [k, `linear-gradient(135deg, ${css(lookPixel(grey(0.12), k, 1))}, ${css(lookPixel(grey(0.5), k, 1))}, ${css(lookPixel(grey(0.88), k, 1))})`]),
);

/** One-click looks: buttons for the nine presets and an intensity slider (committed once on release). */
export default function LookGallery({ clip, disabled }: { clip: Clip; disabled: boolean }) {
  const look = clip.fx.find((e) => e.type === 'look');
  const active = look ? LOOK_KEYS[look.params.preset] : undefined;
  const stored = look?.params.intensity ?? 1;
  const [draft, setDraft] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);
  const value = draft ?? stored;
  const lookId = look?.id;
  useEffect(() => setDraft(null), [stored, clip.id]);
  useEffect(() => {
    const el = ref.current;
    if (!el || !lookId) return;
    const commit = (): void => updateClipFx(clip.id, lookId, { params: { intensity: Number(el.value) } });
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [clip.id, lookId]);
  return (
    <div className="look-gallery" role="group" aria-label="Looks" data-testid="look-gallery">
      <div className="look-buttons">
        {LOOK_KEYS.map((key) => (
          <button key={key} type="button" className="look-btn" disabled={disabled} aria-pressed={active === key} data-testid={`look-${key}`} title={LOOKS[key].label} onClick={() => applyClipLook(clip.id, key, value)}>
            <span className="look-swatch" style={{ background: SWATCH[key] }} />
            {LOOKS[key].label}
          </button>
        ))}
      </div>
      <label className="effect-param">
        <span>
          Look intensity <output>{Math.round(value * 100)} %</output>
        </span>
        <input ref={ref} type="range" min={0} max={1} step={0.01} value={value} disabled={disabled} data-testid="look-intensity" aria-valuetext={`${Math.round(value * 100)} percent`} onChange={(e) => setDraft(Number(e.target.value))} />
      </label>
    </div>
  );
}
