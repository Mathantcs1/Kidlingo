// The read-only motion path of the selected clip (Plan 5 Task 10; editable curved paths are Part 5B): a polyline through
// the sampled position keys UNDER the transform handles, and one dot per visible position key ABOVE them (so a click
// reaches it). Both layers ignore the pointer except the dots, so the path never steals a handle drag. Dots seek (no history).
import { memo, useMemo } from 'react';
import type { KeyboardEvent, ReactNode } from 'react';
import { tooClose } from '../core/keyframes';
import type { Clip, Project } from '../core/model';
import type { Point } from '../render/overlayGeometry';
import { keyAtPlayhead, keyTimelineTime, seekToKeyCmd } from './keyframeCommands';
import { cachedMotionPath } from './motionPathMath';
import type { MotionPathData } from './motionPathMath';
import { formatToCss } from './overlayMath';
import type { Box } from './overlayMath';
import './animation.css';

const POSITION = { kind: 'transform', prop: 'position' } as const;
const DOT_R = 5;

interface Props {
  project: Project;
  /** The clip whose path shows, or null for none (then only the children render). */
  clip: Clip | null;
  playhead: number;
  /** The displayed canvas content box in the overlay layer's CSS px (same box the handles use). */
  box: Box;
  /** The transform handles: rendered between the path line and the key dots. */
  children?: ReactNode;
}

const secondsLabel = (t: number): string => `${(Math.round(t * 100) / 100).toFixed(2)} s`;

/** The polyline layer: purely visual. Memoised on the sampled data and the box, so playback frames do not rebuild it. */
const Line = memo(function Line({ data, box, format }: { data: MotionPathData; box: Box; format: Project['format'] }) {
  const runs = useMemo(
    () => data.runs.map((r) => r.map((p) => { const c: Point = formatToCss(p, box, format); return `${c.x},${c.y}`; }).join(' ')),
    [data, box.left, box.top, box.width, box.height, format.width, format.height], // eslint-disable-line react-hooks/exhaustive-deps
  );
  if (runs.length === 0) return null;
  return (
    <svg className="motion-path-layer" data-testid="motion-path" data-runs={runs.length} aria-hidden="true">
      {runs.map((points, i) => (
        <g key={i}>
          <polyline className="mp-shadow" points={points} />
          <polyline className="mp-line" data-testid="motion-path-run" points={points} />
        </g>
      ))}
    </svg>
  );
});

export default function MotionPath({ project, clip, playhead, box, children }: Props) {
  const format = project.format;
  const fps = format.fps;
  const data = useMemo(() => (clip ? cachedMotionPath(clip, fps, format) : null), [clip, fps, format]);
  if (!clip || !data) return <>{children}</>;
  const here = keyAtPlayhead(clip, POSITION, playhead, fps);
  const seek = (u: number): void => seekToKeyCmd(clip.id, u);
  const onKey = (e: KeyboardEvent, u: number): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    seek(u);
  };
  return (
    <>
      <Line data={data} box={box} format={format} />
      {children}
      {data.keys.length > 0 && (
        <svg className="motion-keys-layer" role="group" aria-label="Position keyframes">
          {data.keys.map((k) => {
            const c = formatToCss(k, box, format);
            const label = `Position keyframe at ${secondsLabel(keyTimelineTime(clip, k.u))}`;
            return (
              <circle
                key={k.u}
                className="motion-key"
                data-testid="motion-key"
                data-time={keyTimelineTime(clip, k.u)}
                data-current={here !== null && tooClose(here.t, k.u) ? 'true' : undefined}
                role="button"
                tabIndex={0}
                aria-label={label}
                cx={c.x}
                cy={c.y}
                r={DOT_R}
                onClick={() => seek(k.u)}
                onKeyDown={(e) => onKey(e, k.u)}
              />
            );
          })}
        </svg>
      )}
    </>
  );
}
