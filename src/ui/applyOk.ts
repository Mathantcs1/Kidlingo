// `apply` through `guard` that says whether the edit went through: a refusal (TimelineError) or any other throw inside
// the edit function reports false (the toast is shown by the store / guard as usual), a no-op counts as success.
// Callers that must react to success only (close a popover, move the selection) use this instead of a bare apply.
import type { Project } from '../core/model';
import { useEditor } from '../state/store';
import { guard } from './Toast';

export function applyOk(fn: (p: Project) => Project): boolean {
  let ok = true;
  guard(() =>
    useEditor.getState().apply((p) => {
      try {
        return fn(p);
      } catch (e) {
        ok = false;
        throw e;
      }
    }),
  );
  return ok;
}
