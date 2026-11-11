// The export's video decoders (split out of exporter.ts): one per clip visible in the frame being rendered.
import type { Id, Project } from '../core/model';
import type { VideoSource } from '../media/decode';
import { visualClipsAt } from '../render/visible';

/**
 * Opens a decoder (keyed by clip id) for each video clip visible at `t` and closes the others: decoders are opened
 * when their clip comes under the playhead and closed as soon as it has passed, so only the clips visible in the
 * current frame (never those on hidden layers) hold a decoder, frames and a texture. `checkAbort` runs after each open.
 */
export async function syncExportSources(
  p: Project,
  t: number,
  sources: Map<Id, VideoSource>,
  open: (mediaId: Id) => Promise<VideoSource>,
  checkAbort: () => void,
): Promise<void> {
  const visible = visualClipsAt(p, t).filter(
    (clip) => clip.kind === 'video' && p.media[clip.mediaId] && !p.media[clip.mediaId].missing,
  );
  const ids = new Set(visible.map((clip) => clip.id));
  for (const [id, source] of sources) {
    if (ids.has(id)) continue;
    source.close();
    sources.delete(id);
  }
  for (const clip of visible) {
    if (sources.has(clip.id)) continue;
    sources.set(clip.id, await open(clip.mediaId));
    checkAbort();
  }
}
