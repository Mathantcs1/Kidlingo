import { useEffect, useRef, useState } from 'react';
import type { Clip, MediaRef, Project } from '../core/model';
import { findClip } from '../core/timeline';
import { useEditor } from '../state/store';
import { liveSelection, setClipFit, setClipVolume } from './edits';
import { guard } from './Toast';
import AudioInspector from './AudioInspector';
import BlendModeSelect from './BlendModeSelect';
import EffectsInspector from './EffectsInspector';
import TransformFields from './TransformFields';

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
function VolumeControl({ clip, disabled }: { clip: Clip; disabled: boolean }) {
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

function FitControl({ clip, disabled }: { clip: Clip; disabled: boolean }) {
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

interface ControlsProps {
  clip: Clip;
  media: MediaRef | undefined;
  editable: boolean;
  locked: boolean;
}

function ClipControls({ clip, media, editable, locked }: ControlsProps) {
  const audible = clip.kind === 'audio' || (clip.kind === 'video' && media?.hasAudio !== false);
  return (
    <>
      <p className="inspector-clip" title={media?.name}>
        {media?.name ?? 'Unknown media'}
      </p>
      {audible ? (
        <VolumeControl clip={clip} disabled={!editable} />
      ) : (
        <p className="inspector-hint">{clip.kind === 'image' ? 'Images have no sound.' : 'This clip has no sound.'}</p>
      )}
      {audible && <AudioInspector clip={clip} media={media} editable={editable} locked={locked} />}
      {clip.kind !== 'audio' && <FitControl clip={clip} disabled={!editable} />}
      {clip.kind !== 'audio' && <TransformFields clip={clip} editable={editable} locked={locked} />}
      {clip.kind !== 'audio' && <BlendModeSelect clip={clip} editable={editable} locked={locked} />}
      {clip.kind !== 'audio' && <EffectsInspector clip={clip} editable={editable} locked={locked} />}
    </>
  );
}

/**
 * Settings of the selected clip (exactly one): volume and, for pictures, how it fills the frame plus its position,
 * scale, rotation and opacity.
 */
export default function Inspector({ editable }: { editable: boolean }) {
  const project = useEditor((s) => s.history.present);
  const selection = useEditor((s) => s.selection);
  const live = liveSelection(project, selection);
  const found = live.length === 1 ? findClip(project, live[0]) : null;
  const clip = found?.clip ?? null;
  return (
    <aside className="inspector" aria-label="Clip settings" data-testid="inspector">
      <div className="panel-head">
        <h2>Clip</h2>
      </div>
      <div className="inspector-body">
        {clip ? (
          <ClipControls
            key={clip.id}
            clip={clip}
            media={project.media[clip.mediaId]}
            editable={editable}
            locked={found?.track.locked ?? false}
          />
        ) : (
          <p className="inspector-hint">{live.length > 1 ? 'Select a single clip to change its settings.' : 'Select a clip'}</p>
        )}
      </div>
    </aside>
  );
}
