// The motion path of the selected clip (Plan 5 Task 10; editable in 5B Task 8): a polyline through the sampled
// position keys UNDER the transform handles (plus faint Continue-loop cycles), and the key dots and tangent handles
// ABOVE them (PathHandles, so a press reaches them), and a "Smooth path" chip. The line layer ignores the pointer, so
// the path never steals a handle drag; a press on the clip centre still drags the clip.
import { memo, useMemo } from 'react';
import type { ReactNode, RefObject } from 'react';
import type { Clip, Project } from '../core/model';
import type { Point } from '../render/overlayGeometry';
import { cachedMotionPath } from './motionPathMath';
import type { MotionPathData } from './motionPathMath';
import { formatToCss } from './overlayMath';
import type { Box } from './overlayMath';
import PathHandles from './PathHandles';
import { smoothPathCmd } from './pathCommands';
import type { LivePath } from './usePathDrag';
import './animation.css';
import './motionEdit.css';

interface Props {
  /** The project as shown (with a live path drag applied): the path, dots and handles follow the drag. */
  project: Project;
  /** The clip whose path shows, or null for none (then only the children render). */
  clip: Clip | null;
  playhead: number;
  /** The displayed canvas content box in the overlay layer's CSS px (same box the handles use). */
  box: Box;
  /** The displayed clip centre in the same CSS px (from the handles), or null without handles: dots near it let presses through. */
  centre: Point | null;
  /** False on a locked track (read-only path). */
  editable: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onLivePath: (l: LivePath | null) => void;
  /** The transform handles: rendered between the path line and the key dots. */
  children?: ReactNode;
}

/** The polyline layer: purely visual. Memoised on the sampled data and the box, so playback frames do not rebuild it. */
const Line = memo(function Line({ data, box, format }: { data: MotionPathData; box: Box; format: Project['format'] }) {
  const runs = useMemo(() => {
    const line = (r: Point[], d: Point): string => r.map((p) => { const c: Point = formatToCss({ x: p.x + d.x, y: p.y + d.y }, box, format); return `${c.x},${c.y}`; }).join(' ');
    return { main: data.runs.map((r) => line(r, { x: 0, y: 0 })), cycles: data.cycles.flatMap((d) => data.runs.map((r) => line(r, d))) };
  }, [data, box.left, box.top, box.width, box.height, format.width, format.height]); // eslint-disable-line react-hooks/exhaustive-deps
  if (runs.main.length === 0) return null;
  return (
    <svg className="motion-path-layer" data-testid="motion-path" data-runs={runs.main.length} aria-hidden="true">
      {runs.cycles.map((points, i) => <polyline key={`c${i}`} className="mp-cycle" data-testid="motion-path-cycle" points={points} />)}
      {runs.main.map((points, i) => (
        <g key={i}>
          <polyline className="mp-shadow" points={points} />
          <polyline className="mp-line" data-testid="motion-path-run" points={points} />
        </g>
      ))}
    </svg>
  );
});

export default function MotionPath({ project, clip, playhead, box, centre, editable, canvasRef, onLivePath, children }: Props) {
  const format = project.format;
  const data = useMemo(() => (clip ? cachedMotionPath(clip, format.fps, format) : null), [clip, format]);
  const keyCount = clip?.keys?.position?.length ?? 0;
  // Fixed slots (line, children, dots) whether or not a path shows, so the handles keep their tree position (the quad's explicit key={clip.id} in TransformOverlay also keeps it mounted).
  return (
    <>
      {clip && data ? <Line data={data} box={box} format={format} /> : null}
      {children}
      {clip && data && data.keys.length > 0 && (
        <PathHandles project={project} clip={clip} keys={data.keys} playhead={playhead} box={box} centre={centre} editable={editable} canvasRef={canvasRef} onLivePath={onLivePath} />
      )}
      {clip && editable && keyCount >= 2 && (
        <div className="mp-toolbar" style={{ left: box.left + 8, top: box.top + 8 }} onPointerDown={(e) => e.stopPropagation()}>
          <button type="button" data-testid="mp-smooth" title="Smooth curves through every position keyframe (one undo step)" onClick={() => smoothPathCmd(clip.id)}>
            Smooth path
          </button>
          {data?.moreCycles && <span className="mp-loop-hint" data-testid="mp-loop-hint">The loop continues beyond the drawn cycles</span>}
        </div>
      )}
    </>
  );
}
