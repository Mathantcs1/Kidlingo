import { useState } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import type { Project } from '../core/model';
import { clipCentre, clipCorners, rotateHandlePoint } from '../render/overlayGeometry';
import type { Handle, Point } from '../render/overlayGeometry';
import { useEditor } from '../state/store';
import { formatToCss, overlayTarget, toleranceInFormatPx } from './overlayMath';
import type { Box } from './overlayMath';
import { HANDLE_PX, ROTATE_PX, handleAt, useTransformDrag } from './useTransformDrag';
import type { DragTarget, LiveTransform } from './useTransformDrag';

const CORNERS = ['tl', 'tr', 'br', 'bl'] as const;

interface Props {
  project: Project;
  playhead: number;
  /** The displayed canvas content box, in CSS px relative to the overlay layer (the preview stage). */
  box: Box;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  live: LiveTransform | null;
  onLive: (l: LiveTransform | null) => void;
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
  if (!target) return null;
  const transform = props.live?.clipId === target.clip.id ? props.live.transform : target.clip.transform;
  // Keyed by clip: selecting another clip (or this one going away) unmounts the quad and ends its drag.
  return <OverlayQuad key={target.clip.id} {...props} target={{ clipId: target.clip.id, size: target.size, transform }} />;
}

function OverlayQuad({ project, box, canvasRef, onLive, target }: Props & { target: DragTarget }) {
  const { begin, dragging } = useTransformDrag(canvasRef, onLive);
  const [hover, setHover] = useState<Handle | null>(null);
  const format = project.format;
  const toCss = (p: Point): Point => formatToCss(p, box, format);
  const corners = clipCorners(target.size, target.transform, format);
  const css = corners.map(toCss);
  const centre = toCss(clipCentre(target.transform, format));
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
    const next = handleAt(canvas, target, e.clientX, e.clientY);
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
