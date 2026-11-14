// The inspector's Animation section (Plan 5B §7): the clip's preset stack as four slots (In, Emphasis, Loop, Out) and
// the preset browser of the slot being chosen. Video, image, overlay and adjustment clips (the browser greys out
// what an adjustment layer cannot take); audio clips have no section. A locked track disables every control. The
// fields above show the REST transform: presets move the picture from there (the canvas outlines where it is drawn).
import { useCallback, useState } from 'react';
import type { Clip } from '../core/model';
import { MOTION_SLOTS } from '../core/motionTypes';
import type { MotionSlot } from '../core/motionTypes';
import AnimTransferBar from './AnimTransferBar';
import PresetBrowser from './PresetBrowser';
import PresetSlot from './PresetSlot';
import './presets.css';

interface Props {
  clip: Clip;
  editable: boolean;
  locked: boolean;
}

export default function AnimationInspector({ clip, editable, locked }: Props) {
  const [open, setOpen] = useState<{ slot: MotionSlot; anchor: HTMLButtonElement } | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const disabled = !editable || locked;
  const title = locked ? 'Track is locked' : undefined;
  return (
    <section className="inspector-field anim-section" data-testid="anim-section" aria-labelledby="anim-section-label">
      <span className="visually-hidden" id="anim-section-label">
        Animation
      </span>
      <p className="anim-hint">Presets move the picture from the position above.</p>
      {MOTION_SLOTS.map((slot) => (
        <PresetSlot
          key={slot}
          clip={clip}
          slot={slot}
          disabled={disabled}
          title={title}
          open={open?.slot === slot}
          onChoose={(anchor) => setOpen((o) => (o?.slot === slot ? null : { slot, anchor }))}
        />
      ))}
      <AnimTransferBar clip={clip} disabled={disabled} lockTitle={title} />
      {open && !disabled && <PresetBrowser clip={clip} slot={open.slot} anchor={open.anchor} onClose={close} />}
    </section>
  );
}
