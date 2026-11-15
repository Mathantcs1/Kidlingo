import type { Clip } from '../core/model';
import { toggleCropMode, useCropMode } from './cropModeStore';
import { fitToCropCmd, resetCropCmd, setCropCmd, setFlipCmd } from './cropCommands';
import NumberField from './NumberField';

const EDGES = [
  { key: 'left', label: 'Left' },
  { key: 'top', label: 'Top' },
  { key: 'right', label: 'Right' },
  { key: 'bottom', label: 'Bottom' },
] as const;

/**
 * Crop (four edges, percent of the picture), the on-canvas crop mode, fit/fill to the cropped area, and the two mirror
 * buttons (Plan 5E). Crop is a mask on the full frame (D1); each commit is one undo step.
 */
export default function CropFields({ clip, disabled, title }: { clip: Clip; disabled: boolean; title?: string }) {
  const modeOn = useCropMode((s) => s.clipId === clip.id);
  const crop = clip.crop;
  return (
    <div className="inspector-field" data-testid="crop-section">
      <div className="tf-grid" role="group" aria-label="Crop">
        {EDGES.map(({ key, label }) => (
          <NumberField
            key={key}
            testId={`crop-${key}`}
            label={label}
            unit="%"
            ariaLabel={`Crop ${key} in percent`}
            value={(crop?.[key] ?? 0) * 100}
            step={1}
            min={0}
            max={95}
            disabled={disabled}
            title={title}
            onCommit={(v) => setCropCmd(clip.id, { [key]: v / 100 })}
          />
        ))}
      </div>
      <div className="crop-actions">
        <button type="button" className="tf-reset" data-testid="crop-mode-toggle" aria-pressed={modeOn} disabled={disabled} title={title ?? 'Drag the crop edges on the picture'} onClick={() => toggleCropMode(clip.id)}>
          Crop on canvas
        </button>
        <button type="button" className="tf-reset" data-testid="crop-fit" disabled={disabled || !crop} title={title ?? 'Fit the cropped area to the canvas'} onClick={() => fitToCropCmd(clip.id, 'fit')}>
          Fit
        </button>
        <button type="button" className="tf-reset" data-testid="crop-fill" disabled={disabled || !crop} title={title ?? 'Fill the canvas with the cropped area'} onClick={() => fitToCropCmd(clip.id, 'fill')}>
          Fill
        </button>
        <button type="button" className="tf-reset" data-testid="crop-reset" disabled={disabled || !crop} title={title ?? 'Remove the crop'} onClick={() => resetCropCmd(clip.id)}>
          Reset
        </button>
      </div>
      <div className="crop-actions" role="group" aria-label="Flip">
        <button type="button" className="tf-reset" data-testid="flip-h" aria-pressed={clip.flip?.h === true} disabled={disabled} title={title ?? 'Flip horizontally'} onClick={() => setFlipCmd(clip.id, { h: clip.flip?.h !== true })}>
          Flip horizontal
        </button>
        <button type="button" className="tf-reset" data-testid="flip-v" aria-pressed={clip.flip?.v === true} disabled={disabled} title={title ?? 'Flip vertically'} onClick={() => setFlipCmd(clip.id, { v: clip.flip?.v !== true })}>
          Flip vertical
        </button>
      </div>
    </div>
  );
}
