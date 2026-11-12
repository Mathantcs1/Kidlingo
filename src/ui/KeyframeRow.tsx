import type { KeyboardEvent } from 'react';
import { useEffect } from 'react';
import { clipDuration } from '../core/model';
import type { Clip } from '../core/model';
import './animation.css';
import { keyTimelineTime } from './keyframeCommands';
import { MIN_ROW_PX, diamondX, rowSummary, selWithoutHiddenRow } from './keyDrag';
import { isPicked, keySel, setKeySel, useKeySelection } from './keySelection';
import { openEaseCmd, selectKeyCmd } from './keySelectionCommands';
import { timeToPx } from './layout';
import { useKeyDrag } from './useKeyDrag';

interface Props {
  clip: Clip;
  pps: number;
  /** On a locked track the diamonds still select and seek, but never move or delete keys (refused with a toast). */
  locked: boolean;
}

/**
 * The summary keyframe row of a selected clip on its lane (Plan 5 D10): one diamond per distinct key time over all of
 * its properties and effects on the visible range (D3 mapping to timeline time), arrows when keys lie beyond an edge.
 * Diamonds are buttons (Tab-reachable, "Keyframe at 1.20 s"); see useKeyDrag for click/drag. A sibling of the clip
 * button (buttons cannot nest), placed over the clip's lower edge.
 */
export default function KeyframeRow({ clip, pps, locked }: Props) {
  const sel = useKeySelection((s) => s.sel);
  const { live, onPointerDown, onClick } = useKeyDrag(clip.id, pps, locked);
  const width = timeToPx(clipDuration(clip), pps);
  const { times, before, after } = rowSummary(clip);
  // A hidden row (zoomed out) must not leave a key selection behind that Delete would act on unseen.
  useEffect(() => setKeySel(selWithoutHiddenRow(keySel(), clip, pps)), [clip, pps]);
  if (width < MIN_ROW_PX || (times.length === 0 && !before && !after)) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>, u: number): void => {
    if (e.key !== 'Enter') return;
    // Enter opens the ease editor for the selection (Task 9 registers it); until then it selects like a click.
    e.preventDefault();
    if (!isPicked(useKeySelection.getState().sel, clip.id, u)) selectKeyCmd(clip.id, u, false);
    openEaseCmd();
  };
  const classes = ['keyframe-row'];
  if (live) classes.push('is-dragging');
  if (live?.rejected) classes.push('is-reject');
  if (locked) classes.push('is-locked');
  return (
    <div
      className={classes.join(' ')}
      style={{ left: timeToPx(clip.start, pps), width }}
      data-testid="keyframe-row"
      data-clip-id={clip.id}
      role="group"
      aria-label="Keyframes"
    >
      {before && <span className="keyframe-more keyframe-more-before" data-testid="keyframe-more-before" aria-hidden="true" />}
      {times.map((u) => {
        const picked = isPicked(sel, clip.id, u);
        const shown = picked && live ? u + live.delta : u;
        const time = keyTimelineTime(clip, shown);
        return (
          <button
            key={u}
            type="button"
            className="keyframe-diamond"
            data-testid="keyframe-diamond"
            data-time={time.toFixed(4)}
            data-selected={String(picked)}
            aria-pressed={picked}
            aria-label={`Keyframe at ${time.toFixed(2)} s`}
            title={locked ? 'Track is locked' : `Keyframe at ${time.toFixed(2)} s`}
            style={{ left: diamondX(clip, shown, pps) }}
            onPointerDown={(e) => onPointerDown(e, u)}
            onClick={(e) => onClick(e, u)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              openEaseCmd();
            }}
            onKeyDown={(e) => onKeyDown(e, u)}
          />
        );
      })}
      {after && <span className="keyframe-more keyframe-more-after" data-testid="keyframe-more-after" aria-hidden="true" />}
    </div>
  );
}
