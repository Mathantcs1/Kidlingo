import type { Clip } from '../core/model';
import { SPEED_PRESETS } from '../core/speedPresets';
import { MAX_SPEED, MIN_SPEED } from '../core/speedTypes';
import NumberField from './NumberField';
import { applySpeedPresetCmd, setRampCmd } from './speedCommands';

const W = 220;
const H = 56;

/** The ramp as a small graph: speed (log scale) against footage time, one dot per key. */
function RampGraph({ clip }: { clip: Clip }) {
  const keys = clip.speedKeys ?? [];
  const span = clip.out - clip.in || 1;
  const y = (v: number): number => H - ((Math.log(v) - Math.log(MIN_SPEED)) / (Math.log(MAX_SPEED) - Math.log(MIN_SPEED))) * H;
  const x = (t: number): number => ((t - clip.in) / span) * W;
  const line = keys.map((k) => `${x(k.t).toFixed(1)},${y(k.v).toFixed(1)}`).join(' ');
  return (
    <svg className="speed-graph" data-testid="speed-ramp-graph" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Speed ramp graph">
      <line x1="0" x2={W} y1={y(1)} y2={y(1)} className="speed-graph-unit" />
      <polyline points={line} className="speed-graph-line" fill="none" />
      {keys.map((k, i) => (
        <circle key={i} cx={x(k.t)} cy={y(k.v)} r="3" className="speed-graph-dot" data-testid="speed-ramp-dot" />
      ))}
    </svg>
  );
}

/** Ramp presets, the point values and the graph of a clip's speed ramp. */
export default function SpeedRamp({ clip, disabled, title, ripple }: { clip: Clip; disabled: boolean; title?: string; ripple: boolean }) {
  const keys = clip.speedKeys;
  return (
    <div className="speed-ramp" data-testid="speed-ramp">
      <div className="crop-actions" role="group" aria-label="Speed ramp presets">
        {SPEED_PRESETS.map((p) => (
          <button key={p.key} type="button" className="tf-reset" data-testid={`speed-preset-${p.key}`} disabled={disabled} title={title ?? p.hint} onClick={() => applySpeedPresetCmd(clip.id, p.key, ripple)}>
            {p.label}
          </button>
        ))}
      </div>
      {keys && (
        <>
          <RampGraph clip={clip} />
          <div className="tf-grid" role="group" aria-label="Ramp points">
            {keys.map((k, i) => (
              <NumberField
                key={i}
                testId={`speed-point-${i}`}
                label={`Point ${i + 1}`}
                unit="%"
                ariaLabel={`Speed of ramp point ${i + 1} in percent`}
                value={k.v * 100}
                step={5}
                min={MIN_SPEED * 100}
                max={MAX_SPEED * 100}
                disabled={disabled}
                title={title}
                onCommit={(v) => setRampCmd(clip.id, keys.map((q, j) => (j === i ? { ...q, v: v / 100 } : q)), ripple)}
              />
            ))}
          </div>
          <button type="button" className="tf-reset" data-testid="speed-ramp-remove" disabled={disabled} title={title ?? 'Remove the ramp and play at constant speed'} onClick={() => setRampCmd(clip.id, null, ripple)}>
            Remove ramp
          </button>
        </>
      )}
    </div>
  );
}
