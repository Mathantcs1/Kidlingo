// One slot row of the animation inspector (Plan 5B §7): its name, the chosen preset (or None), Choose (opens the
// preset browser), Remove (ONE step; undo restores the slot exactly) and, when filled, the preset's settings.
import type { Clip } from '../core/model';
import type { MotionSlot } from '../core/motionTypes';
import { presetLabel } from '../core/presets';
import PresetParams from './PresetParams';
import { removePresetCmd, slotUse } from './presetCommands';

export const SLOT_LABEL: Record<MotionSlot, string> = { in: 'In', emphasis: 'Emphasis', loop: 'Loop', out: 'Out' };

interface Props {
  clip: Clip;
  slot: MotionSlot;
  disabled: boolean;
  title: string | undefined;
  open: boolean;
  onChoose(button: HTMLButtonElement): void;
}

export default function PresetSlot({ clip, slot, disabled, title, open, onChoose }: Props) {
  const use = slotUse(clip, slot);
  const name = use ? presetLabel(use.preset, slot) : 'None';
  return (
    <div className="anim-slot" data-testid={`anim-slot-${slot}`} data-preset={use?.preset}>
      <div className="anim-slot-head">
        <span className="anim-slot-label">{SLOT_LABEL[slot]}</span>
        <span className="anim-slot-name" data-testid={`anim-${slot}-name`}>
          {name}
        </span>
        <button
          type="button"
          data-testid={`anim-choose-${slot}`}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-label={`Choose ${SLOT_LABEL[slot].toLowerCase()} preset`}
          disabled={disabled}
          title={title}
          onClick={(e) => onChoose(e.currentTarget)}
        >
          {use ? 'Change' : 'Choose'}
        </button>
        {use && (
          <button
            type="button"
            className="anim-remove"
            data-testid={`anim-remove-${slot}`}
            aria-label={`Remove ${SLOT_LABEL[slot].toLowerCase()} preset ${name}`}
            disabled={disabled}
            title={title ?? 'Remove'}
            onClick={() => removePresetCmd(clip.id, slot)}
          >
            ✕
          </button>
        )}
      </div>
      {use && <PresetParams clip={clip} slot={slot} use={use} disabled={disabled} />}
    </div>
  );
}
