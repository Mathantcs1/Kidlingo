// The interactive part of the motion path (Plan 5 Task 10, editable in 5B Task 8): one dot per visible position key
// (click or Enter seeks; drag moves that key, ONE step; double-click toggles corner/smooth, ONE step) and, for the key
// under the playhead, its tangent handles (drag = ONE step; Alt breaks a smooth key). Read-only on a locked track
// (dots still seek). A dot on the displayed clip centre lets presses through to the clip (5A rule), except right after
// it was clicked, so a double-click reaches it.
import { useEffect, useState } from 'react';
import type { KeyboardEvent, RefObject } from 'react';
import { tooClose } from '../core/keyframes';
import type { Clip, Project } from '../core/model';
import type { Point } from '../render/overlayGeometry';
import { keyAtPlayhead, keyTimelineTime, seekToKeyCmd } from './keyframeCommands';
import { DOT_R, dotPassesThrough, toFormat } from './motionPathMath';
import type { PathKey } from './motionPathMath';
import { formatToCss } from './overlayMath';
import type { Box } from './overlayMath';
import { toggleCornerCmd } from './pathCommands';
import { isCorner, shownTangents } from './pathDragMath';
import { usePathDrag } from './usePathDrag';
import type { LivePath } from './usePathDrag';
import './motionEdit.css';

const POSITION = { kind: 'transform', prop: 'position' } as const;
/** How long a clicked dot keeps the pointer although it sits on the clip centre (a double-click's second press). */
const ARMED_MS = 600;
const TANGENT_R = 4.5;

interface Props {
  project: Project;
  clip: Clip;
  keys: PathKey[];
  playhead: number;
  box: Box;
  centre: Point | null;
  /** False on a locked track: no drags, no handles; dots still seek. */
  editable: boolean;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  onLivePath: (l: LivePath | null) => void;
}

const secondsLabel = (t: number): string => `${(Math.round(t * 100) / 100).toFixed(2)} s`;

export default function PathHandles({ project, clip, keys, playhead, box, centre, editable, canvasRef, onLivePath }: Props) {
  const format = project.format;
  const list = clip.keys?.position ?? [];
  const here = keyAtPlayhead(clip, POSITION, playhead, format.fps);
  const drag = usePathDrag(canvasRef, onLivePath);
  const [armed, setArmed] = useState<number | null>(null);
  useEffect(() => {
    if (armed === null) return;
    const id = window.setTimeout(() => setArmed(null), ARMED_MS);
    return () => window.clearTimeout(id);
  }, [armed]);
  const css = (p: Point): Point => formatToCss(p, box, format);
  const seek = (u: number): void => seekToKeyCmd(clip.id, u);
  const onKey = (e: KeyboardEvent, u: number): void => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    e.stopPropagation();
    seek(u);
  };
  const hi = here ? list.findIndex((k) => tooClose(k.t, here.t)) : -1;
  const tangents = editable && hi >= 0 ? shownTangents(list, hi) : {};
  const anchor = hi >= 0 ? css(toFormat(list[hi], format)) : null;
  return (
    <svg className="motion-keys-layer" role="group" aria-label="Position keyframes">
      {anchor && (['in', 'out'] as const).map((side) => {
        const t = tangents[side];
        if (!t) return null;
        const p = css(toFormat({ x: list[hi].x + t.v.x, y: list[hi].y + t.v.y }, format));
        return (
          <g key={side}>
            <line className="mp-tangent-stem" x1={anchor.x} y1={anchor.y} x2={p.x} y2={p.y} />
            <circle
              className="motion-tangent"
              data-testid={`motion-tangent-${side}`}
              data-empty={t.empty ? 'true' : undefined}
              aria-label={`${side === 'in' ? 'Incoming' : 'Outgoing'} path handle`}
              cx={p.x}
              cy={p.y}
              r={TANGENT_R}
              onPointerDown={(e) => drag.begin(e, { clipId: clip.id, list, index: hi, part: side, start: t.v })}
            />
          </g>
        );
      })}
      {keys.map((k) => {
        const c = css(k);
        const i = list.findIndex((x) => x.t === k.u);
        const through = dotPassesThrough(c, centre) && armed !== k.u;
        return (
          <circle
            key={k.u}
            className="motion-key"
            data-testid="motion-key"
            data-time={keyTimelineTime(clip, k.u)}
            data-through={through ? 'true' : undefined}
            data-armed={armed === k.u ? 'true' : undefined}
            data-current={here !== null && tooClose(here.t, k.u) ? 'true' : undefined}
            data-corner={i >= 0 && isCorner(list, i) ? 'true' : undefined}
            role="button"
            tabIndex={0}
            aria-label={`Position keyframe at ${secondsLabel(keyTimelineTime(clip, k.u))}`}
            cx={c.x}
            cy={c.y}
            r={DOT_R}
            onPointerDown={editable && i >= 0 ? (e) => drag.begin(e, { clipId: clip.id, list, index: i, part: 'key', start: { x: list[i].x, y: list[i].y } }) : undefined}
            onClick={() => {
              if (drag.consumeClick()) return;
              seek(k.u);
              setArmed(k.u);
            }}
            onDoubleClick={editable ? () => toggleCornerCmd(clip.id, k.u) : undefined}
            onKeyDown={(e) => onKey(e, k.u)}
          />
        );
      })}
    </svg>
  );
}
