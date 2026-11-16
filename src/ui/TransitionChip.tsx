import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Project, Track } from '../core/model';
import { maxDuration } from '../core/transitions';
import type { Transition } from '../core/transitionTypes';
import { chipBox, dragDuration } from './transitionDrag';
import { selectTransitionCmd, setTransitionDurationCmd } from './transitionCommands';
import { useTransitionSelection } from './transitionSelection';
import './transitions.css';

const LABEL: Record<Transition['type'], string> = {
  dip: 'Dip', dissolve: 'Dissolve', wipe: 'Wipe', slide: 'Slide', push: 'Push', zoom: 'Zoom', glitch: 'Glitch', audio: 'Crossfade',
};

/**
 * A transition on a cut (Plan 5C): a chip centred on the cut as wide as its duration. Click selects it; the two handles
 * change the duration symmetrically (local state while dragging, ONE apply on release, Escape cancels).
 */
export default function TransitionChip({ project, track, tr, pps }: { project: Project; track: Track; tr: Transition; pps: number }) {
  const from = track.clips.find((c) => c.id === tr.fromClipId);
  const to = track.clips.find((c) => c.id === tr.toClipId);
  const selected = useTransitionSelection((s) => s.id === tr.id);
  const [live, setLive] = useState<number | null>(null);
  const cancel = useRef<(() => void) | null>(null);
  useEffect(() => () => cancel.current?.(), []);
  if (!from || !to) return null;
  const duration = live ?? tr.duration;
  const box = chipBox(duration, to.start, pps);

  const begin = (e: PointerEvent<HTMLElement>, side: 'l' | 'r'): void => {
    e.stopPropagation();
    if (track.locked || e.button !== 0) return;
    const x0 = e.clientX;
    const max = maxDuration(project, from, to);
    const fps = project.format.fps;
    let value = tr.duration;
    let cancelled = false;
    const onMove = (ev: globalThis.PointerEvent): void => {
      value = dragDuration({ start: tr.duration, side, dxPx: ev.clientX - x0, pps, fps, max });
      setLive(value);
    };
    const end = (): void => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('keydown', onKey, true);
      cancel.current = null;
      setLive(null);
    };
    const onUp = (): void => {
      end();
      if (!cancelled && Math.abs(value - tr.duration) > 1e-9) setTransitionDurationCmd(tr.id, value);
    };
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.key !== 'Escape') return;
      cancelled = true;
      ev.preventDefault();
      ev.stopPropagation();
      end();
    };
    cancel.current = end;
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('keydown', onKey, true);
  };

  return (
    <div
      className={`transition-chip${selected ? ' is-selected' : ''}${track.locked ? ' is-locked' : ''}`}
      style={{ left: box.left, width: box.width }}
      data-testid="transition-chip"
      data-transition-id={tr.id}
      data-type={tr.type}
      data-duration={duration.toFixed(4)}
      role="button"
      aria-pressed={selected}
      aria-label={`${LABEL[tr.type]} transition, ${duration.toFixed(2)} s`}
      title={`${LABEL[tr.type]} ${duration.toFixed(2)} s`}
      tabIndex={0}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        selectTransitionCmd(tr.id);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') selectTransitionCmd(tr.id);
      }}
    >
      <span className="transition-chip-handle transition-chip-handle-l" data-testid="transition-chip-handle-l" onPointerDown={(e) => begin(e, 'l')} />
      <span className="transition-chip-label">{LABEL[tr.type]}</span>
      <span className="transition-chip-handle transition-chip-handle-r" data-testid="transition-chip-handle-r" onPointerDown={(e) => begin(e, 'r')} />
    </div>
  );
}
