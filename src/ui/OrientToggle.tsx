// "Orient along path" (Plan 5B Task 8, D7): the picture turns with the direction of its motion path (the rotation
// field then shows rotation + heading). ONE step each way; turning it off keeps the frame at the playhead by baking
// the heading there into the stored rotation (setOrientAt, like the position stopwatch off). Needs two position keys.
import type { Clip } from '../core/model';
import { setOrientCmd } from './pathCommands';

export default function OrientToggle({ clip, disabled, title }: { clip: Clip; disabled: boolean; title?: string }) {
  const keys = clip.keys;
  if (!keys?.position) return null;
  const on = keys.orient === true;
  const enough = keys.position.length >= 2;
  return (
    <label className="kf-orient" title={title ?? (enough || on ? 'Turn the picture with the direction of its motion path' : 'Needs two position keyframes')}>
      <input type="checkbox" data-testid="kf-orient" checked={on} disabled={disabled || (!on && !enough)} onChange={(e) => setOrientCmd(clip.id, e.target.checked)} />
      <span>Orient along path</span>
    </label>
  );
}
