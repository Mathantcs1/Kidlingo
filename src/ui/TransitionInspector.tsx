import type { Ease } from '../core/easing';
import type { Project, Track } from '../core/model';
import { maxDuration } from '../core/transitions';
import { TRANSITION_DIRECTIONS, TRANSITION_EASES } from '../core/transitionTypes';
import type { CrossfadeLaw, Transition, TransitionType } from '../core/transitionTypes';
import NumberField from './NumberField';
import { openHelp } from './helpStore';
import { removeTransitionCmd, setTransitionCmd, setTransitionDurationCmd } from './transitionCommands';
import './transitions.css';

const TYPE_LABEL: Record<TransitionType, string> = {
  dip: 'Dip to black', dissolve: 'Dissolve', wipe: 'Wipe', slide: 'Slide', push: 'Push', zoom: 'Zoom', glitch: 'Glitch', audio: 'Audio crossfade',
};
const EASE_LABEL: Record<string, string> = { linear: 'Linear', easeIn: 'Ease in', easeOut: 'Ease out', easeInOut: 'Ease in and out', bezier: 'Smooth curve' };
const DEFAULT_BEZIER: [number, number, number, number] = [0.42, 0, 0.58, 1];
const easeOf = (kind: string): Ease => (kind === 'bezier' ? { kind: 'bezier', bezier: DEFAULT_BEZIER } : ({ kind } as Ease));

/** The selected transition's settings (Plan 5C): type, duration, ease, direction, softness / amount and the audio law. Each change is ONE undo step. */
export default function TransitionInspector({ project, track, tr, editable }: { project: Project; track: Track; tr: Transition; editable: boolean }) {
  const disabled = !editable || track.locked;
  const title = track.locked ? 'Track is locked' : undefined;
  const from = track.clips.find((c) => c.id === tr.fromClipId);
  const to = track.clips.find((c) => c.id === tr.toClipId);
  const max = from && to ? maxDuration(project, from, to) : tr.duration;
  const types = (Object.keys(TYPE_LABEL) as TransitionType[]).filter((t) => (track.kind === 'audio') === (t === 'audio'));
  const directional = tr.type === 'wipe' || tr.type === 'slide' || tr.type === 'push';
  return (
    <div className="transition-inspector" data-testid="transition-inspector">
      <label className="tf-field" title={title ?? 'Transition type'}>
        <span className="tf-label">Type</span>
        <select data-testid="transition-type" aria-label="Transition type" value={tr.type} disabled={disabled} onChange={(e) => setTransitionCmd(tr.id, { type: e.target.value as TransitionType })}>
          {types.map((t) => (
            <option key={t} value={t}>{TYPE_LABEL[t]}</option>
          ))}
        </select>
      </label>
      <div className="tf-grid" role="group" aria-label="Transition timing">
        <NumberField
          testId="transition-duration"
          label="Duration"
          unit="s"
          ariaLabel="Transition duration in seconds"
          value={tr.duration}
          step={0.1}
          min={0}
          max={max}
          disabled={disabled}
          title={title ?? `Up to ${max.toFixed(2)} s with the footage beyond this cut`}
          onCommit={(v) => setTransitionDurationCmd(tr.id, v)}
        />
      </div>
      <label className="tf-field" title={title ?? 'How the transition progresses'}>
        <span className="tf-label">Ease</span>
        <select data-testid="transition-ease" aria-label="Transition ease" value={tr.ease.kind} disabled={disabled} onChange={(e) => setTransitionCmd(tr.id, { ease: easeOf(e.target.value) })}>
          {TRANSITION_EASES.map((k) => (
            <option key={k} value={k}>{EASE_LABEL[k] ?? k}</option>
          ))}
        </select>
      </label>
      {directional && (
        <div className="crop-actions" role="group" aria-label="Direction">
          {TRANSITION_DIRECTIONS.map((d) => (
            <button key={d} type="button" className="tf-reset" data-testid={`transition-direction-${d}`} aria-pressed={tr.direction === d} disabled={disabled} title={title ?? `From the ${d}`} onClick={() => setTransitionCmd(tr.id, { direction: d })}>
              {d[0].toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      )}
      {tr.type === 'wipe' && (
        <NumberField testId="transition-softness" label="Softness" unit="%" ariaLabel="Wipe edge softness in percent" value={(tr.softness ?? 0.05) * 100} step={1} min={0} max={50} disabled={disabled} title={title} onCommit={(v) => setTransitionCmd(tr.id, { softness: v / 100 })} />
      )}
      {tr.type === 'zoom' && (
        <NumberField testId="transition-amount" label="Zoom" unit="x" ariaLabel="Zoom factor" value={tr.amount ?? 2} step={0.1} min={1.2} max={4} disabled={disabled} title={title} onCommit={(v) => setTransitionCmd(tr.id, { amount: v })} />
      )}
      {tr.type === 'glitch' && (
        <NumberField testId="transition-amount" label="Strength" unit="%" ariaLabel="Glitch strength in percent" value={(tr.amount ?? 0.5) * 100} step={5} min={0} max={100} disabled={disabled} title={title} onCommit={(v) => setTransitionCmd(tr.id, { amount: v / 100 })} />
      )}
      <label className="tf-field" title={title ?? 'How the sound of the two clips is crossfaded'}>
        <span className="tf-label">Audio</span>
        <select data-testid="transition-audio-curve" aria-label="Audio crossfade curve" value={tr.audio ?? 'power'} disabled={disabled} onChange={(e) => setTransitionCmd(tr.id, { audio: e.target.value as CrossfadeLaw })}>
          <option value="power">Equal power</option>
          <option value="gain">Constant gain</option>
        </select>
      </label>
      <div className="crop-actions">
        <button type="button" className="tf-reset" data-testid="transition-remove" disabled={disabled} title={title ?? 'Remove the transition'} onClick={() => removeTransitionCmd(tr.id)}>
          Remove
        </button>
        <button type="button" className="tf-reset" data-testid="transition-help" onClick={() => openHelp('controls-transitions')}>
          Help
        </button>
      </div>
    </div>
  );
}
