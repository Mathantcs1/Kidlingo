import type { KeyboardEvent, PointerEvent, ReactElement } from 'react';
import { useRef } from 'react';
import type { Ease } from '../core/easing';
import { FRAME, clampHandle, clientToSvg, curvePath, fromSvg, nudgeHandle, round3, toSvg, viewSize, withHandle } from './easeEditorMath';
import type { Bezier } from './easeEditorMath';

interface Props {
  /** The curve to draw (the live draft while dragging). */
  ease: Ease;
  /** Handles of `ease` when it is a cubic Bézier equivalent; null (hold, back, elastic, bounce) shows no handles. */
  bezier: Bezier | null;
  disabled: boolean;
  /** Live local change (drag move, arrow press): nothing is committed. */
  onDraft: (b: Bezier) => void;
  /** The gesture ended (pointer up, arrow key up, focus lost): the parent commits the draft ONCE. */
  onRelease: () => void;
  onCancel: () => void;
}

const ARROWS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown']);

/**
 * The SVG plot of one segment's eased progress: the unit square (time across, progress up), the curve, and two
 * draggable handles (focusable sliders: arrows nudge by 0.01, Shift by 0.1). Handles are clamped to x in [0, 1],
 * y in [-1, 2]. A drag or nudge only drafts; the release commits (parent).
 */
export default function EaseCurve({ ease, bezier, disabled, onDraft, onRelease, onCancel }: Props) {
  const svg = useRef<SVGSVGElement>(null);
  const dragging = useRef<1 | 2 | null>(null);
  const nudged = useRef(false);
  const live = useRef(bezier);
  live.current = bezier;
  const v = viewSize();
  const origin = toSvg({ x: 0, y: 0 });
  const end = toSvg({ x: 1, y: 1 });
  const draft = (b: Bezier): void => {
    live.current = b;
    onDraft(b);
  };

  const onDown = (e: PointerEvent<SVGCircleElement>, which: 1 | 2): void => {
    if (disabled || !live.current || e.button !== 0) return;
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.focus();
    dragging.current = which;
  };
  const onMove = (e: PointerEvent<SVGCircleElement>): void => {
    const which = dragging.current;
    if (!which || !live.current || !svg.current) return;
    const p = clientToSvg(e.clientX, e.clientY, svg.current.getBoundingClientRect());
    const h = fromSvg(p.px, p.py);
    draft(withHandle(live.current, which, { x: round3(h.x), y: round3(h.y) }));
  };
  const onUp = (e: PointerEvent<SVGCircleElement>): void => {
    if (!dragging.current) return;
    dragging.current = null;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    onRelease();
  };
  const onCancelled = (): void => {
    if (!dragging.current) return;
    dragging.current = null;
    onCancel();
  };
  const onKeyDown = (e: KeyboardEvent<SVGCircleElement>, which: 1 | 2): void => {
    if (disabled || !live.current || !ARROWS.has(e.key)) return;
    const cur = which === 1 ? live.current.slice(0, 2) : live.current.slice(2);
    const next = nudgeHandle(clampHandle({ x: cur[0], y: cur[1] }), e.key, e.shiftKey);
    if (!next) return;
    e.preventDefault();
    e.stopPropagation();
    nudged.current = true;
    draft(withHandle(live.current, which, next));
  };
  // One undo step per press and release (auto-repeat only drafts), also when focus leaves mid-nudge.
  const endNudge = (): void => {
    if (!nudged.current) return;
    nudged.current = false;
    onRelease();
  };

  const handle = (which: 1 | 2): ReactElement | null => {
    if (!bezier) return null;
    const h = which === 1 ? { x: bezier[0], y: bezier[1] } : { x: bezier[2], y: bezier[3] };
    const p = toSvg(h);
    const anchor = which === 1 ? origin : end;
    return (
      <g key={which}>
        <line className="ease-stem" x1={anchor.px} y1={anchor.py} x2={p.px} y2={p.py} />
        <circle
          className="ease-handle"
          data-testid={`ease-handle-${which}`}
          cx={p.px}
          cy={p.py}
          r={6}
          tabIndex={disabled ? -1 : 0}
          role="slider"
          aria-label={`Ease handle ${which}`}
          aria-valuemin={0}
          aria-valuemax={1}
          aria-valuenow={h.x}
          aria-valuetext={`time ${round3(h.x)}, progress ${round3(h.y)}`}
          aria-disabled={disabled || undefined}
          onPointerDown={(e) => onDown(e, which)}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onCancelled}
          onKeyDown={(e) => onKeyDown(e, which)}
          onKeyUp={(e) => ARROWS.has(e.key) && endNudge()}
          onBlur={endNudge}
        />
      </g>
    );
  };

  return (
    <svg ref={svg} className="ease-plot" data-testid="ease-plot" viewBox={`0 0 ${v.w} ${v.h}`} width={v.w} height={v.h} role="group" aria-label="Ease curve">
      <rect className="ease-unit" x={origin.px} y={end.py} width={end.px - origin.px} height={origin.py - end.py} />
      <line className="ease-diagonal" x1={origin.px} y1={origin.py} x2={end.px} y2={end.py} />
      <path className="ease-curve" data-testid="ease-curve" data-kind={ease.kind} d={curvePath(ease, FRAME)} />
      {handle(1)}
      {handle(2)}
      <circle className="ease-end" cx={origin.px} cy={origin.py} r={3} />
      <circle className="ease-end" cx={end.px} cy={end.py} r={3} />
    </svg>
  );
}
