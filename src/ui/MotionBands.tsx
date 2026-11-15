// Timeline bands of a clip's animation presets (Plan 5B §7): a ramp over the entrance window at the start, one over
// the exit window at the end (both from motionWindows: the windows as drawn, short-clip scaling included), a band
// over the emphasis window and a thin striped line for a loop. Purely visual: pointer-events none, hidden from
// assistive tech, so they never take a clip drag, a trim or a click (the inspector is the edit path).
import { hasOwnTimeline, isIdentityTime, offsetOfLocal } from '../core/clipTime';
import { clipDuration } from '../core/model';
import type { Clip } from '../core/model';
import { motionWindows } from '../core/motion';
import { timeToPx } from './layout';
import { slotUse } from './presetCommands';

const MIN_PX = 2;

export default function MotionBands({ clip, pps }: { clip: Clip; pps: number }) {
  const w = motionWindows(clip);
  const emphasis = slotUse(clip, 'emphasis');
  const loop = slotUse(clip, 'loop');
  if (!w.in && !w.out && !emphasis && !loop) return null;
  const d = clipDuration(clip);
  const band = (start: number, end: number) => {
    const a = Math.min(Math.max(0, start), d);
    const b = Math.min(Math.max(a, end), d);
    return { left: timeToPx(a, pps), width: Math.max(MIN_PX, timeToPx(b - a, pps)) };
  };
  // Emphasis `at`/`duration` are FOOTAGE seconds: under speed the band's ends come from the map (swapped in reverse).
  const ends = emphasis?.at !== undefined ? [offsetOfLocal(clip, emphasis.at), offsetOfLocal(clip, emphasis.at + emphasis.duration)] : null;
  const retimed = !isIdentityTime(clip) && !hasOwnTimeline(clip);
  const at = ends === null ? null : retimed ? Math.min(ends[0], ends[1]) : ends[0];
  const emphasisLen = ends === null || emphasis === undefined ? 0 : retimed ? Math.abs(ends[1] - ends[0]) : emphasis.duration;
  return (
    <span className="motion-bands" aria-hidden="true">
      {loop && <span className="motion-band motion-band-loop" data-testid="motion-band-loop" />}
      {w.in && <span className="motion-band motion-band-in" data-testid="motion-band-in" style={band(w.in.start, w.in.end)} />}
      {w.out && <span className="motion-band motion-band-out" data-testid="motion-band-out" style={band(w.out.start, w.out.end)} />}
      {emphasis && at !== null && at < d && at + emphasisLen > 0 && (
        <span className="motion-band motion-band-emphasis" data-testid="motion-band-emphasis" style={band(at, at + emphasisLen)} />
      )}
    </span>
  );
}
