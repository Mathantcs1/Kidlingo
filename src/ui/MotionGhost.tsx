// The motion ghost on the preview (Plan 5B D3, Ruling P5B-7): a faint dashed outline (`motion-ghost`) of where the
// selected clip is actually drawn while its presets move it away from the handles (which stay at the REST transform),
// and the drawn quads of preset-moved pictures as a SELECTION hit region: a click on one selects that clip. A press
// there never starts a drag (drags edit the rest transform through the handles); handles keep priority because the
// transform overlay stops the presses it takes.
import { useRef } from 'react';
import type { PointerEvent } from 'react';
import type { Project } from '../core/model';
import { useEditor } from '../state/store';
import { pastThreshold } from './drag';
import { liveSelection } from './edits';
import { ghostHitAt, motionGhost } from './motionGhost';
import { cssToFormat, formatToCss } from './overlayMath';
import type { Box } from './overlayMath';
import { findClip } from '../core/timeline';
import './presets.css';

interface Props {
  project: Project;
  playhead: number;
  /** The displayed canvas content box in the stage's CSS px. */
  box: Box;
}

/** The dashed outline of the one selected clip's drawn quad, when presets draw it away from its rest quad. */
export default function MotionGhost({ project, playhead, box }: Props) {
  const selection = useEditor((s) => s.selection);
  const live = liveSelection(project, selection);
  if (live.length !== 1) return null;
  const quad = motionGhost(project, findClip(project, live[0]).clip, playhead);
  if (!quad) return null;
  const points = quad.map((p) => formatToCss(p, box, project.format)).map((c) => `${c.x},${c.y}`).join(' ');
  return (
    <svg className="motion-ghost-layer" aria-hidden="true">
      <polygon className="motion-ghost" data-testid="motion-ghost" data-clip-id={live[0]} points={points} />
    </svg>
  );
}

/**
 * Stage pointer handlers for the ghost hit region: a press that nothing above took (the transform overlay stops the
 * presses on its handles; key dots are skipped) and is released within the drag threshold on a preset-moved picture
 * selects it. No history.
 */
export function useGhostSelect(project: Project, playhead: number, box: Box) {
  const down = useRef<{ id: number; x: number; y: number; clipId: string } | null>(null);
  const local = (e: PointerEvent<HTMLElement>): { x: number; y: number } => {
    const r = e.currentTarget.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: PointerEvent<HTMLElement>): void => {
    down.current = null;
    if (e.button !== 0 || e.defaultPrevented || (e.target as Element).closest?.('.motion-key')) return;
    const hit = ghostHitAt(project, playhead, cssToFormat(local(e), box, project.format));
    if (hit) down.current = { id: e.pointerId, x: e.clientX, y: e.clientY, clipId: hit };
  };
  const onPointerUp = (e: PointerEvent<HTMLElement>): void => {
    const d = down.current;
    down.current = null;
    if (!d || d.id !== e.pointerId || pastThreshold(e.clientX - d.x, e.clientY - d.y)) return;
    useEditor.getState().select([d.clipId]);
  };
  return { onPointerDown, onPointerUp };
}
