import type { Clip, MediaRef } from '../core/model';
import { ADJUSTMENT_LABEL } from '../core/adjustment';
import { overlayLabel } from '../core/overlays';
import { findClip } from '../core/timeline';
import { useEditor } from '../state/store';
import { hasAnimation } from '../core/animPayload';
import { liveSelection } from './edits';
import AnimationInspector from './AnimationInspector';
import AudioInspector from './AudioInspector';
import BlendModeSelect from './BlendModeSelect';
import { FitControl, VolumeControl } from './ClipBasics';
import { audioEffectsSummary } from './EffectList';
import EffectsInspector, { effectsSummary } from './EffectsInspector';
import './inspector.css';
import InspectorSection from './InspectorSection';
import OverlayInspector from './OverlayInspector';
import TransformFields from './TransformFields';

const NO_SOUND: Partial<Record<Clip['kind'], string>> = {
  image: 'Images have no sound.',
  overlay: 'Overlays have no sound.',
  adjustment: 'Adjustment layers have no sound.',
};
const OPACITY_ONLY = ['opacity'] as const;

interface ControlsProps {
  clip: Clip;
  media: MediaRef | undefined;
  editable: boolean;
  locked: boolean;
}

function ClipControls({ clip, media, editable, locked }: ControlsProps) {
  const audible = clip.kind === 'audio' || (clip.kind === 'video' && media?.hasAudio !== false);
  // Overlays take no fit, blend mode or effects (the core refuses them); they have their own inspector. Adjustment
  // layers take effects, a blend mode and opacity, but no fit or position (full frame).
  const picture = clip.kind === 'video' || clip.kind === 'image';
  const adjustment = clip.kind === 'adjustment';
  return (
    <>
      {clip.kind === 'overlay' && (
        <InspectorSection name="overlay" title="Overlay">
          <OverlayInspector clip={clip} editable={editable} locked={locked} />
        </InspectorSection>
      )}
      {clip.kind !== 'audio' && (
        <InspectorSection name="transform" title={adjustment ? 'Layer' : 'Transform'}>
          {picture && <FitControl clip={clip} disabled={!editable} />}
          <TransformFields clip={clip} editable={editable} locked={locked} only={adjustment ? OPACITY_ONLY : undefined} />
          {(picture || adjustment) && <BlendModeSelect clip={clip} editable={editable} locked={locked} />}
        </InspectorSection>
      )}
      {clip.kind !== 'audio' && (
        <InspectorSection name="animation" title="Animation" summary={hasAnimation(clip) ? 'Animated' : undefined}>
          <AnimationInspector clip={clip} editable={editable} locked={locked} />
        </InspectorSection>
      )}
      {(picture || adjustment) && (
        <InspectorSection name="effects" title="Effects" summary={effectsSummary(clip)}>
          <EffectsInspector clip={clip} editable={editable} locked={locked} />
        </InspectorSection>
      )}
      {audible && (
        <InspectorSection name="audio" title="Audio" summary={clip.audio.silent ? 'Detached' : audioEffectsSummary(clip)}>
          <VolumeControl clip={clip} disabled={!editable} />
          <AudioInspector clip={clip} media={media} editable={editable} locked={locked} />
        </InspectorSection>
      )}
      {!audible && <p className="inspector-hint inspector-pad">{NO_SOUND[clip.kind] ?? 'This clip has no sound.'}</p>}
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
  const media = clip ? project.media[clip.mediaId] : undefined;
  const name = !clip ? null : clip.kind === 'overlay' ? overlayLabel(clip) : clip.kind === 'adjustment' ? ADJUSTMENT_LABEL : media?.name;
  return (
    <aside className="inspector" aria-label="Clip settings" data-testid="inspector">
      <div className="panel-head">
        <h2>Effect Controls</h2>
      </div>
      {clip && (
        <div className="inspector-clip-row">
          <p className="inspector-clip" title={name ?? undefined}>
            {name ?? 'Unknown media'}
          </p>
          <span className="inspector-kind">{clip.kind}</span>
        </div>
      )}
      <div className="inspector-body">
        {clip ? (
          <ClipControls
            key={clip.id}
            clip={clip}
            media={media}
            editable={editable}
            locked={found?.track.locked ?? false}
          />
        ) : (
          <p className="inspector-hint inspector-pad">{live.length > 1 ? 'Select a single clip to change its settings.' : 'Select a clip'}</p>
        )}
      </div>
    </aside>
  );
}
