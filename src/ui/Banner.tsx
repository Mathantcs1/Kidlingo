import { CAPABILITY_LABELS } from '../media/support';
import type { Capability } from '../media/support';

/** Names exactly which of the browser APIs ClipForge needs are missing (nothing when all are present). */
export default function Banner({ missing }: { missing: Capability[] }) {
  if (missing.length === 0) return null;
  return (
    <div className="banner" role="alert" data-testid="banner-no-webcodecs">
      Your browser is missing: {missing.map((c) => CAPABILITY_LABELS[c]).join(', ')}. Use a recent desktop Chrome.
    </div>
  );
}
