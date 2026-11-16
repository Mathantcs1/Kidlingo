// Until the fused transition pass exists (Plan 5C Task 5) a transition is drawn as a plain crossfade: the outgoing picture at
// opacity (1 − e), the incoming one at e, each over the layers below with its own blend mode.
import type { Draw, FrameDraw, PlainDraw } from './drawCollect';
import { isTransitionDraw } from './drawCollect';

const scaled = (d: Draw, k: number): Draw => ({ ...d, clip: { ...d.clip, transform: { ...d.clip.transform, opacity: d.clip.transform.opacity * k } } });

/** `draws` with every transition replaced by its two pictures at crossfade opacities. */
export function expandTransitions(draws: FrameDraw[]): PlainDraw[] {
  return draws.flatMap((d): PlainDraw[] => {
    if (!isTransitionDraw(d)) return [d];
    const out: Draw[] = [];
    if (d.a) out.push(scaled(d.a, 1 - d.e));
    if (d.b) out.push(scaled(d.b, d.e));
    return out;
  });
}
