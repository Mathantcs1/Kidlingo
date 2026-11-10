// Drives the preview compositor: latest-wins render scheduling and one VideoSource per active video clip.
import type { Id, Project } from '../core/model';
import type { VideoSource } from '../media/decode';
import type { Compositor } from '../render/compositor';
import { shownClipIds, visualClipsAt } from '../render/visible';
import { ChunkLoadError, loadChunk } from '../loadChunk';

export interface PreviewCallbacks {
  /** A clip's media could not be opened; called once per media file. */
  onSourceError(name: string): void;
  /** Rendering is no longer possible (e.g. the WebGL context was lost). */
  onFatal(message: string): void;
}

const LOST = 'WebGL context lost';
/** Sources of clips no longer under the playhead kept open for quick scrubbing back. */
const KEEP_RECENT = 2;

interface Request {
  p: Project;
  t: number;
}

/**
 * Renders (project, time) requests into a canvas. While a render runs only the newest request is kept, so
 * scrubbing and playback never build a backlog. Sources are opened lazily for video clips under the playhead and
 * closed once their clip is neither under the playhead nor among the KEEP_RECENT most recently shown; a clip whose
 * source fails to open is not retried while it stays in the project.
 */
export class PreviewRenderer {
  private readonly sources = new Map<Id, VideoSource>();
  private readonly failedClips = new Set<Id>();
  private readonly reportedMedia = new Set<Id>();
  private pending: Request | null = null;
  private running = false;
  private disposed = false;
  private stopped = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly compositor: Compositor,
    private readonly callbacks: PreviewCallbacks,
  ) {}

  /** Loads the compositor and binds it to `canvas`; rejects if WebGL2 is unavailable. */
  static async create(canvas: HTMLCanvasElement, callbacks: PreviewCallbacks): Promise<PreviewRenderer> {
    // Shares the lazily loaded chunk the exporter uses for the compositor.
    const { createCompositor } = await loadChunk(() => import('../render/compositor'));
    return new PreviewRenderer(canvas, createCompositor(canvas, { preserveDrawingBuffer: true }), callbacks);
  }

  resize(width: number, height: number): void {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.compositor.resize(width, height);
  }

  /** Renders `p` at `t` as soon as the current render (if any) finishes, replacing any older pending request. */
  request(p: Project, t: number): void {
    if (this.disposed || this.stopped) return;
    this.pending = { p, t };
    this.canvas.dataset.renderState = 'busy';
    if (!this.running) void this.pump();
  }

  /** Stops rendering for good and reports why (later requests are ignored). */
  private stop(message: string): void {
    this.pending = null;
    this.stopped = true;
    this.callbacks.onFatal(message);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = null;
    for (const s of this.sources.values()) s.close();
    this.sources.clear();
    this.compositor.dispose();
  }

  private async pump(): Promise<void> {
    this.running = true;
    while (this.pending && !this.disposed) {
      const { p, t } = this.pending;
      this.pending = null;
      try {
        await this.syncSources(p, t);
        if (this.disposed) break;
        await this.compositor.renderFrame(p, t, this.sources);
        this.canvas.dataset.renderedT = String(t);
      } catch (e) {
        if (this.disposed) break;
        // A missing code chunk (the app was updated) cannot recover either: say so once and stop rendering.
        if (e instanceof ChunkLoadError) {
          this.stop(e.message);
          break;
        }
        console.error('clipforge: preview render failed', e);
        const message = e instanceof Error ? e.message : String(e);
        // A lost context cannot recover; other failures (e.g. one bad frame) only skip this render.
        if (message === LOST) {
          this.stop('The preview stopped: the WebGL context was lost. Reload to restore it.');
          break;
        }
      }
    }
    this.running = false;
    if (!this.disposed && !this.pending) this.canvas.dataset.renderState = 'idle';
  }

  /**
   * Opens sources for the video clips visible at `t` and closes the others, except the KEEP_RECENT most recently
   * shown ones (cheap scrubbing back and forth over a cut). Also forgets failures of clips/media that are gone.
   */
  private async syncSources(p: Project, t: number): Promise<void> {
    const live = new Set(p.tracks.flatMap((tr) => tr.clips.map((c) => c.id)));
    for (const id of this.failedClips) if (!live.has(id)) this.failedClips.delete(id);
    for (const id of this.reportedMedia) if (!p.media[id]) this.reportedMedia.delete(id);
    // Hidden layers are not drawn, so their clips get no decoder (and lose a recent one).
    const shown = shownClipIds(p);
    const active = visualClipsAt(p, t).filter((c) => c.kind === 'video');
    const activeIds = new Set(active.map((c) => c.id));
    // Map order is least recently shown first: move the active ones to the end.
    for (const id of activeIds) {
      const s = this.sources.get(id);
      if (!s) continue;
      this.sources.delete(id);
      this.sources.set(id, s);
    }
    const recent = [...this.sources.keys()].filter((id) => !activeIds.has(id) && shown.has(id)).slice(-KEEP_RECENT);
    const keep = new Set([...activeIds, ...recent]);
    for (const [id, s] of this.sources) {
      if (keep.has(id)) continue;
      s.close();
      this.sources.delete(id);
    }
    const wanted = active.filter((c) => !this.sources.has(c.id) && !this.failedClips.has(c.id));
    if (wanted.length === 0) return;
    // Loaded on first use so the media toolkit stays out of the startup bundle.
    const { openVideoSource } = await loadChunk(() => import('../media/decode'));
    for (const clip of wanted) {
      const media = p.media[clip.mediaId];
      if (!media || media.missing) continue;
      try {
        const source = await openVideoSource(clip.mediaId);
        if (this.disposed) {
          source.close();
          return;
        }
        this.sources.set(clip.id, source);
      } catch (e) {
        if (this.disposed) return;
        console.error('clipforge: could not open video', e);
        this.failedClips.add(clip.id);
        if (!this.reportedMedia.has(media.id)) {
          this.reportedMedia.add(media.id);
          this.callbacks.onSourceError(media.name);
        }
      }
    }
  }
}
