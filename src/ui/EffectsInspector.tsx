import { useState } from 'react';
import type { Clip, VideoEffectType } from '../core/model';
import { VIDEO_EFFECTS } from '../core/videoEffects';
import { useEditor } from '../state/store';
import './effects.css';
import LooksGallery from './LooksGallery';
import LutPicker from './LutPicker';
import VideoEffectRow from './VideoEffectRow';
import { GROUP_LABEL, addMenuGroups, addVideoEffectCmd } from './videoEffectCommands';

const GROUPS = addMenuGroups();

/** Header summary of the Effects group. */
export const effectsSummary = (clip: Clip): string | undefined => (clip.effects.length > 0 ? `${clip.effects.length} applied` : undefined);

interface Props {
  clip: Clip;
  editable: boolean;
  locked: boolean;
}

/**
 * The selected picture clip's effects: looks gallery, add menu (grouped), the stack (applied top to bottom), and the
 * LUT picker. Every action is one undo step; everything is disabled for a clip on a locked track.
 */
export default function EffectsInspector({ clip, editable, locked }: Props) {
  const media = useEditor((s) => s.history.present.media);
  // A native <select> fires `change` on every arrow key on some platforms, so choosing a type only stages it.
  const [chosen, setChosen] = useState<VideoEffectType | ''>('');
  const disabled = !editable || locked;
  const add = (): void => {
    if (!chosen) return;
    addVideoEffectCmd(clip.id, chosen);
    setChosen('');
  };
  return (
    <section className="inspector-field fx-panel" data-testid="fx-panel" aria-label="Picture effects">
      <LooksGallery clipId={clip.id} disabled={disabled} />
      <span className="inspector-label inspector-sub" id="fx-label">
        Add effect
      </span>
      <div className="effect-tools" role="group" aria-labelledby="fx-label">
        <select
          data-testid="fx-add"
          aria-label="Effect to add"
          value={chosen}
          disabled={disabled}
          onChange={(e) => setChosen(e.target.value as VideoEffectType | '')}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              add();
            }
          }}
        >
          <option value="">Effect…</option>
          {GROUPS.map(({ group, types }) => (
            <optgroup key={group} label={GROUP_LABEL[group]}>
              {types.map((t) => (
                <option key={t} value={t}>
                  {VIDEO_EFFECTS[t].label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <button type="button" data-testid="fx-add-button" disabled={disabled || !chosen} onClick={add}>
          Add
        </button>
      </div>
      <p className="effect-hint" data-testid="fx-order-note">
        Effects run from top to bottom: each one works on the result of the one above it.
      </p>
      {clip.effects.length > 0 && (
        <ol className="effect-rows" data-testid="fx-stack">
          {clip.effects.map((e, i) => (
            <VideoEffectRow
              key={e.id}
              clip={clip}
              effect={e}
              index={i}
              count={clip.effects.length}
              disabled={disabled}
              lut={e.ref ? media[e.ref] : undefined}
            />
          ))}
        </ol>
      )}
      <LutPicker clipId={clip.id} disabled={disabled} editable={editable} />
    </section>
  );
}
