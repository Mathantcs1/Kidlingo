import { useEffect, useRef } from 'react';
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react';
import { CROP_HANDLES, dragCrop, frameFractionAt } from '../core/cropDrag';
import type { CropHandle } from '../core/cropDrag';
import { cropMinimum } from '../core/cropTypes';
import type { Crop } from '../core/cropTypes';
import type { Id, Project } from '../core/model';
import { findClip } from '../core/timeline';
import { clipCorners, frameCorners } from '../render/overlayGeometry';
import type { Point } from '../render/overlayGeometry';
import { useEditor } from '../state/store';
import './crop.css';
import { setCropCmd } from './cropCommands';
import { canvasBoxOf } from './overlayHit';
import type { DragTarget } from './overlayHit';
import { cssToFormat, formatToCss } from './overlayMath';
import type { Box } from './overlayMath';

const HANDLE = 10;
const DRAG_PX = 3;

/** A crop drag in progress as the preview shows it (withLiveCrop) until the release commits it. */
export interface LiveCrop { clipId: Id; crop: Crop }

const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const EDGES: Record<CropHandle, number | null> = { tl: 0, tr: 1, br: 2, bl: 3, t: null, r: null, b: null, l: null };

/** The handle's point on the (CSS px) visible quad: a corner, or the middle of an edge. */
function handlePoint(css: Point[], h: CropHandle): Point {
  const i = EDGES[h];
  if (i !== null) return css[i];
  return h === 't' ? mid(css[0], css[1]) : h === 'r' ? mid(css[1], css[2]) : h === 'b' ? mid(css[2], css[3]) : mid(css[3], css[0]);
}

interface Props {
  project: Project;
  box: Box;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  target: DragTarget;
  onLiveCrop: (l: LiveCrop | null) => void;
}

/**
 * The on-canvas crop mode of the selected picture clip (Plan 5E): the dashed full frame, the visible quad and eight
 * handles. Dragging an edge or corner changes the crop live (the preview draws it, withLiveCrop); the release commits
 * ONE apply, Escape / pointercancel / losing the clip end it without committing. Hidden from assistive tech: the
 * inspector's Crop fields are the keyboard path. (TransformOverlay ends the mode when the clip stops being the target.)
 */
export default function CropOverlay({ project, box, canvasRef, target, onLiveCrop }: Props) {
  const drag = useRef<{ handle: CropHandle; start: Crop | undefined; last: Crop | undefined; down: Point; active: boolean; stop: () => void } | null>(null);
  const format = project.format;
  useEffect(() => () => {
    drag.current?.stop();
    onLiveCrop(null);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const view = target.view ?? {};
  const toCss = (p: Point): Point => formatToCss(p, box, format);
  const visible = clipCorners(target.size, target.transform, format, view).map(toCss);
  const frame = frameCorners(target.size, target.transform, format, view).map(toCss);

  const begin = (e: ReactPointerEvent<SVGElement>, handle: CropHandle): void => {
    const canvas = canvasRef.current;
    const clip = findClip(useEditor.getState().history.present, target.clipId).clip;
    if (e.button !== 0 || drag.current || !canvas) return;
    e.preventDefault();
    e.stopPropagation();
    const el = e.currentTarget;
    try {
      el.setPointerCapture(e.pointerId);
    } catch {
      // The window listeners below still see the gesture.
    }
    const media = useEditor.getState().history.present.media[clip.mediaId];
    const [minX, minY] = [cropMinimum(media?.width), cropMinimum(media?.height)];
    const g = { handle, start: clip.crop, last: clip.crop, down: { x: e.clientX, y: e.clientY }, active: false, stop: () => undefined as void };
    drag.current = g;
    const at = (x: number, y: number): Crop => {
      const p = cssToFormat({ x, y }, canvasBoxOf(canvas), format);
      const f = frameFractionAt(p, target.transform, target.size, view.anchor, format);
      return dragCrop(g.start, handle, f.u, f.v, minX, minY);
    };
    const move = (ev: PointerEvent): void => {
      if (!g.active && Math.hypot(ev.clientX - g.down.x, ev.clientY - g.down.y) < DRAG_PX) return;
      g.active = true;
      g.last = at(ev.clientX, ev.clientY);
      onLiveCrop({ clipId: target.clipId, crop: g.last });
    };
    const end = (commit: boolean): void => {
      g.stop();
      drag.current = null;
      onLiveCrop(null);
      if (commit && g.active && g.last) setCropCmd(target.clipId, g.last);
    };
    const up = (ev: PointerEvent): void => {
      if (ev.pointerId === e.pointerId) end(true);
    };
    const cancel = (): void => end(false);
    const key = (ev: KeyboardEvent): void => {
      if (ev.key === 'Escape') cancel();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('blur', cancel);
    window.addEventListener('keydown', key);
    g.stop = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      window.removeEventListener('blur', cancel);
      window.removeEventListener('keydown', key);
    };
  };

  const pts = (q: Point[]): string => q.map((p) => `${p.x},${p.y}`).join(' ');
  return (
    <svg className="transform-overlay crop-overlay" data-testid="crop-overlay" data-clip-id={target.clipId} aria-hidden="true">
      <polygon className="crop-frame" data-testid="crop-frame" points={pts(frame)} />
      <polygon className="tov-body" data-testid="crop-visible" points={pts(visible)} />
      {CROP_HANDLES.map((h) => {
        const p = handlePoint(visible, h);
        return (
          <rect
            key={h}
            className={`tov-handle crop-handle crop-handle-${h}`}
            data-testid={`crop-handle-${h}`}
            x={p.x - HANDLE / 2}
            y={p.y - HANDLE / 2}
            width={HANDLE}
            height={HANDLE}
            onPointerDown={(e) => begin(e, h)}
          />
        );
      })}
    </svg>
  );
}
