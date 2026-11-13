import { useEffect, useRef, useState } from 'react';
import type { Clip, Project } from '../core/model';
import { useEditor } from '../state/store';
import { setClipFit, setClipVolume } from './edits';
import { guard } from './Toast';

const FIT_MODES: { mode: Clip['fit']; label: string; hint: string }[] = [
  { mode: 'fit', label: 'Fit', hint: 'Show the whole picture (black bars if the shape differs)' },
  { mode: 'fill', label: 'Fill', hint: 'Fill the frame, cropping the edges' },
  { mode: 'blur', label: 'Blur', hint: 'Show the whole picture over a blurred copy of itself' },
];

const apply = (fn: (p: Project) => Project): void => guard(() => useEditor.getState().apply(fn));

/**
 * Volume 0–200 %: the label follows the slider live; the project changes ONCE when the slider is released (the
 * native `change` event: pointer up, or each key press), so a drag is one undo step.
 */
export function VolumeControl({ clip, disabled }: { clip: Clip; disabled: boolean }) {
  const [draft, setDraft] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const percent = draft ?? Math.round(clip.volume * 100);
  useEffect(() => setDraft(null), [clip.id, clip.volume]);
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const commit = (): void => {
      const v = Number(el.value) / 100;
      apply((p) => setClipVolume(p, clip.id, v));
      setDraft(null);
    };
    el.addEventListener('change', commit);
    return () => el.removeEventListener('change', commit);
  }, [clip.id]);
  return (
    <label className="inspector-field">
      <span className="inspector-label">
        Volume <output data-testid="inspector-volume-value">{percent}%</output>
      </span>
      <input
        ref={inputRef}
        type="range"
        min={0}
        max={200}
        step={1}
        value={percent}
        disabled={disabled}
        data-testid="inspector-volume"
        aria-valuetext={`${percent} percent`}
        onChange={(e) => setDraft(Number(e.target.value))}
      />
    </label>
  );
}

export function FitControl({ clip, disabled }: { clip: Clip; disabled: boolean }) {
  return (
    <div className="inspector-field">
      <span className="inspector-label" id="inspector-fit-label">
        Frame
      </span>
      <div className="segmented" role="group" aria-labelledby="inspector-fit-label" data-testid="inspector-fit">
        {FIT_MODES.map(({ mode, label, hint }) => (
          <button
            key={mode}
            type="button"
            data-value={mode}
            aria-pressed={clip.fit === mode}
            title={hint}
            disabled={disabled}
            onClick={() => {
              if (clip.fit !== mode) apply((p) => setClipFit(p, clip.id, mode));
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
