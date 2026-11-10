// Drives the preview compositor: latest-wins render scheduling and one VideoSource per active video clip.
import type { Id, Project } from '../core/model';
import { activeClipsAt } from '../core/timeline';
import type { VideoSource } from '../media/decode';
import type { Compositor } from '../render/compositor';

export interface PreviewCallbacks {
  /** A clip's media could not be opened; called once per media file. */
  onSourceError(name: string): void;
  /** Rendering is no longer possible (e.g. the WebGL context was lost). */
  onFatal(message: string): void;
}

const LOST = 'WebGL context lost';

interface Request {
  p: Project;
  t: number;
}

/**
 * Renders (project, time) requests into a canvas. While a render runs only the newest request is kept, so
 * scrubbing and playback never build a backlog. Sources are opened lazily for video clips under the playhead,
 * closed when their clip leaves the project, and a clip whose source fails to open is never retried.
 */
export class PreviewRenderer {
  private readonly sources = new Map<Id, VideoSource>();
  private readonly failedClips = new Set<Id>();
  private readonly reportedMedia = new Set<Id>();
  private pending: Request | null = null;
  private running = false;
  private disposed = false;

  private constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly compositor: Compositor,
    private readonly callbacks: PreviewCallbacks,
  ) {}

  /** Loads the compositor and binds it to `canvas`; rejects if WebGL2 is unavailable. */
  static async create(canvas: HTMLCanvasElement, callbacks: PreviewCallbacks): Promise<PreviewRenderer> {
    // Shares the lazily loaded chunk the exporter uses for the compositor.
    const { createCompositor } = await import('../render/compositor');
    return new PreviewRenderer(canvas, createCompositor(canvas, { preserveDrawingBuffer: true }), callbacks);
  }

  resize(width: number, height: number): void {
    if (this.canvas.width === width && this.canvas.height === height) return;
    this.compositor.resize(width, height);
  }

  /** Renders `p` at `t` as soon as the current render (if any) finishes, replacing any older pending request. */
  request(p: Project, t: number): void {
    if (this.disposed) return;
    this.pending = { p, t };
    this.canvas.dataset.renderState = 'busy';
    if (!this.running) void this.pump();
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
        console.error('clipforge: preview render failed', e);
        const message = e instanceof Error ? e.message : String(e);
        // A lost context cannot recover; other failures (e.g. one bad frame) only skip this render.
        if (message === LOST) {
          this.pending = null;
          this.callbacks.onFatal('The preview stopped: the WebGL context was lost. Reload to restore it.');
          break;
        }
      }
    }
    this.running = false;
    if (!this.disposed && !this.pending) this.canvas.dataset.renderState = 'idle';
  }

  /** Closes sources of clips no longer in `p` and opens sources for video clips visible at `t`. */
  private async syncSources(p: Project, t: number): Promise<void> {
    const live = new Set(p.tracks.flatMap((tr) => tr.clips.map((c) => c.id)));
    for (const [id, s] of this.sources) {
      if (live.has(id)) continue;
      s.close();
      this.sources.delete(id);
    }
    const videoTracks = new Set(p.tracks.filter((tr) => tr.kind === 'video').flatMap((tr) => tr.clips.map((c) => c.id)));
    const wanted = activeClipsAt(p, t).filter(
      (c) => c.kind === 'video' && videoTracks.has(c.id) && !this.sources.has(c.id) && !this.failedClips.has(c.id),
    );
    if (wanted.length === 0) return;
    // Loaded on first use so the media toolkit stays out of the startup bundle.
    const { openVideoSource } = await import('../media/decode');
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
