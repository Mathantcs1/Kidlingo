import { useState } from 'react';
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { resolvedTransform } from '../core/animate';
import type { Project, Transform } from '../core/model';
import { findClip } from '../core/timeline';
import { clipCentre, clipCorners, rotateHandlePoint } from '../render/overlayGeometry';
import type { Handle, Point } from '../render/overlayGeometry';
import { useEditor } from '../state/store';
import { formatToCss, overlayTarget, toleranceInFormatPx } from './overlayMath';
import type { Box } from './overlayMath';
import { HANDLE_PX, ROTATE_PX, handleAt } from './overlayHit';
import type { DragTarget, LiveTransform } from './overlayHit';
import MotionPath from './MotionPath';
import { PASS_THROUGH_PX, motionPathTarget, toFormat } from './motionPathMath';
import { keyAtPlayhead } from './keyframeCommands';
import { toggleCornerCmd } from './pathCommands';
import { useTransformDrag } from './useTransformDrag';
import type { LivePath } from './usePathDrag';
import { withLiveValue } from './transformEdits';

const CORNERS = ['tl', 'tr', 'br', 'bl'] as const;

interface Props {
  project: Project;
  playhead: number;
  /** The displayed canvas content box, in CSS px relative to the overlay layer (the preview stage). */
  box: Box;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  live: LiveTransform | null;
  onLive: (l: LiveTransform | null) => void;
  /** A motion path drag (key dot or tangent handle) in progress; `project` already shows it. */
  onLivePath: (l: LivePath | null) => void;
}

/**
 * Where the handles sit during a transform drag. A keyed clip shows the transform the release will produce, evaluated
 * (5B M4): moving an oriented clip's position key turns its heading, so the handles turn with the picture instead of
 * keeping the old heading until release. A static clip shows the drag's transform as before.
 */
function liveHandles(p: Project, live: LiveTransform): Transform {
  const { clip } = findClip(p, live.clipId);
  if (!clip.keys) return live.transform;
  return resolvedTransform(findClip(withLiveValue(p, live.clipId, live.patch, live.t), live.clipId).clip, live.t, p.format.fps);
}

/** The pointer cursor for a handle; corner cursors follow the corner's direction from the centre (rotated clips). */
function cursorFor(handle: Handle | null, corners: Point[], centre: Point, dragging: boolean): string | undefined {
  if (!handle) return undefined;
  if (handle === 'move') return 'move';
  if (handle === 'rotate') return dragging ? 'grabbing' : 'grab';
  const c = corners[CORNERS.indexOf(handle.slice(6) as (typeof CORNERS)[number])];
  return (c.x - centre.x) * (c.y - centre.y) > 0 ? 'nwse-resize' : 'nesw-resize';
}

/**
 * The on-canvas move/scale/rotate overlay of the one selected picture clip under the playhead (see overlayTarget):
 * a dashed outline, four corner handles and a rotate handle above the top edge. It covers the whole preview stage,
 * so handles outside the canvas (a full-frame clip's rotate handle) stay reachable. Hidden from assistive tech:
 * the inspector's numeric fields are the keyboard path.
 */
export default function TransformOverlay(props: Props) {
  const selection = useEditor((s) => s.selection);
  const target = overlayTarget(props.project, selection, props.playhead);
  // The selected clip's motion path (editable; read-only on a locked layer, where there are no handles).
  const pathClip = motionPathTarget(props.project, selection);
  if (!target && !pathClip) return null;
  // Handles sit on the picture as drawn at the playhead (keys resolved there), or on the live drag.
  let quadTarget: DragTarget | null = null;
  let centre: Point | null = null;
  if (target) {
    const live = props.live?.clipId === target.clip.id ? props.live : null;
    const transform = live ? liveHandles(props.project, live) : resolvedTransform(target.clip, props.playhead, props.project.format.fps);
    centre = formatToCss(clipCentre(transform, props.project.format), props.box, props.project.format);
    quadTarget = { clipId: target.clip.id, size: target.size, transform };
  }
  const editable = pathClip !== null && !findClip(props.project, pathClip.id).track.locked;
  // The dot of the key under the playhead lets presses through to the clip (it sits on its centre), so a double-click
  // there lands on the body: within the dot's reach it toggles that key's corner, like a double-click on any other dot.
  const onDoubleClick = (e: ReactMouseEvent<SVGSVGElement>): void => {
    const here = pathClip && editable ? keyAtPlayhead(pathClip, { kind: 'transform', prop: 'position' }, props.playhead, props.project.format.fps) : null;
    const key = here && pathClip?.keys?.position?.find((k) => k.t === here.t);
    if (!pathClip || !key) return;
    const dot = formatToCss(toFormat(key, props.project.format), props.box, props.project.format);
    const r = e.currentTarget.getBoundingClientRect();
    if (Math.hypot(e.clientX - r.left - dot.x, e.clientY - r.top - dot.y) <= PASS_THROUGH_PX) toggleCornerCmd(pathClip.id, key.t);
  };
  // Keyed by clip: selecting another clip (or this one going away) unmounts the quad and ends its drag.
  const quad = quadTarget && centre ? <OverlayQuad key={quadTarget.clipId} {...props} centre={centre} target={quadTarget} onDoubleClick={onDoubleClick} /> : null;
  return (
    <MotionPath project={props.project} clip={pathClip} playhead={props.playhead} box={props.box} centre={centre} editable={editable} canvasRef={props.canvasRef} onLivePath={props.onLivePath}>
      {quad}
    </MotionPath>
  );
}

function OverlayQuad({ project, box, canvasRef, onLive, target, centre, onDoubleClick }: Props & { target: DragTarget; centre: Point; onDoubleClick?: (e: ReactMouseEvent<SVGSVGElement>) => void }) {
  const { begin, dragging } = useTransformDrag(canvasRef, onLive);
  const [hover, setHover] = useState<Handle | null>(null);
  const format = project.format;
  const toCss = (p: Point): Point => formatToCss(p, box, format);
  const corners = clipCorners(target.size, target.transform, format);
  const css = corners.map(toCss);
  const rot = toCss(rotateHandlePoint(corners, toleranceInFormatPx(ROTATE_PX, box, format)));
  const topMid = { x: (css[0].x + css[1].x) / 2, y: (css[0].y + css[1].y) / 2 };
  const h = HANDLE_PX / 2;

  const onPointerDown = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const handle = begin(e, target);
    if (handle) setHover(handle);
  };
  const onPointerMove = (e: ReactPointerEvent<SVGSVGElement>): void => {
    const canvas = canvasRef.current;
    if (!canvas || dragging()) return;
    const next = handleAt(canvas, format, target, e.clientX, e.clientY);
    if (next !== hover) setHover(next);
  };

  return (
    <svg
      className="transform-overlay"
      data-testid="transform-overlay"
      data-clip-id={target.clipId}
      aria-hidden="true"
      style={{ cursor: cursorFor(hover, css, centre, dragging()) }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={() => !dragging() && setHover(null)}
      onDoubleClick={onDoubleClick}
    >
      <line className="tov-connector" x1={topMid.x} y1={topMid.y} x2={rot.x} y2={rot.y} />
      <polygon className="tov-shadow" points={css.map((p) => `${p.x},${p.y}`).join(' ')} />
      <polygon className="tov-body" data-testid="overlay-body" points={css.map((p) => `${p.x},${p.y}`).join(' ')} />
      {CORNERS.map((k, i) => (
        <rect
          key={k}
          className={`tov-handle tov-${k}`}
          data-testid={`overlay-handle-scale-${k}`}
          x={css[i].x - h}
          y={css[i].y - h}
          width={HANDLE_PX}
          height={HANDLE_PX}
        />
      ))}
      <circle className="tov-handle tov-rotate" data-testid="overlay-handle-rotate" cx={rot.x} cy={rot.y} r={h} />
    </svg>
  );
}
