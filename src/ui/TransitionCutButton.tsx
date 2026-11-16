import { useState } from 'react';
import type { DragEvent } from 'react';
import type { Clip, Track } from '../core/model';
import { pairAllowed } from '../core/transitions';
import { addTransitionCmd, lastTransitionSpec } from './transitionCommands';
import { draggedTransition, isTransitionDrag, setDraggedTransition } from './transitionDnd';
import { TRANSITION_MIME } from './transitionDnd';
import type { TransitionType } from '../core/transitionTypes';
import { chipBox } from './transitionDrag';
import { timeToPx } from './layout';

/**
 * The "+" on a bare cut (Plan 5C): a click adds the last-used transition; a transition tile dropped on it adds that type
 * (the dashed ghost shows the window it would take while the tile is over it). ONE undo step either way.
 */
export default function TransitionCutButton({ track, from, to, time, pps }: { track: Track; from: Clip; to: Clip; time: number; pps: number }) {
  const [over, setOver] = useState<TransitionType | null>(null);
  const accepts = (t: TransitionType | null): boolean => t !== null && pairAllowed(track, { type: t }, from, to);
  const onOver = (e: DragEvent<HTMLButtonElement>): void => {
    if (!isTransitionDrag(e)) return;
    const t = draggedTransition();
    if (!accepts(t)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setOver(t);
  };
  const box = chipBox(lastTransitionSpec().duration ?? 1, to.start, pps);
  return (
    <>
      <button
        type="button"
        className={`transition-cut${over ? ' is-drop' : ''}`}
        data-testid="transition-cut"
        data-cut-time={time.toFixed(4)}
        aria-label="Add a transition on this cut"
        title="Add a transition"
        style={{ left: timeToPx(time, pps) }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
          e.stopPropagation();
          addTransitionCmd(track.id, from.id, to.id);
        }}
        onDragEnter={onOver}
        onDragOver={onOver}
        onDragLeave={() => setOver(null)}
        onDrop={(e) => {
          if (!isTransitionDrag(e)) return;
          e.preventDefault();
          e.stopPropagation();
          const type = (e.dataTransfer.getData(TRANSITION_MIME) as TransitionType) || draggedTransition();
          setOver(null);
          setDraggedTransition(null);
          if (type && accepts(type)) addTransitionCmd(track.id, from.id, to.id, { ...lastTransitionSpec(), type });
        }}
      >
        +
      </button>
      {over && <div className="transition-drop-ghost" data-testid="transition-drop-ghost" style={{ left: box.left, width: box.width }} />}
    </>
  );
}
