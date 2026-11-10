import { useEffect, useMemo, useRef, useState } from 'react';
import { useEditor } from '../state/store';
import { fitBox, previewSize } from './layout';
import { PreviewRenderer } from './previewRenderer';
import { showError } from './Toast';
import { ChunkLoadError } from '../loadChunk';
import { toGlUnavailable } from '../render/glErrors';
import { buildDetailsText, describeGlFailure, probeRenderer } from './previewFailure';
import { PreviewFailure } from './PreviewFailure';
import type { GlFailureView } from './PreviewFailure';
import TransformOverlay from './TransformOverlay';
import { withClipTransform } from './transformEdits';
import { useElementSize } from './useElementSize';
import type { LiveTransform } from './useTransformDrag';

/** CSS px kept free around the canvas inside the stage, so overlay handles beyond its edges stay on screen. */
const HANDLE_ROOM = 36;

/** A plain message (chunk reload, lost context), or a renderer start-up failure with details and Try again. */
type Failure = { message: string } | { gl: GlFailureView };

/** Logs the real error and turns it into the panel's wording and technical details. */
function glFailure(e: unknown): Failure {
  console.error('clipforge: preview could not start', e);
  const err = toGlUnavailable(e);
  const userAgent = navigator.userAgent;
  return { gl: { ...describeGlFailure(err, userAgent), details: buildDetailsText(err, { userAgent, renderer: probeRenderer() }) } };
}

/**
 * The preview panel: a WebGL canvas at the project's aspect ratio, fitted to the panel, showing the frame
 * under the playhead. It re-renders on playhead, project, format and size changes (latest request wins). While
 * `editable`, the selected picture clip gets the on-canvas transform overlay; a drag on it is previewed live here
 * (a throwaway project through the same renderer) and reaches the store only on release.
 */
export default function Preview({ editable }: { editable: boolean }) {
  const project = useEditor((s) => s.history.present);
  const playhead = useEditor((s) => s.playhead);
  const [stageRef, size] = useElementSize<HTMLDivElement>();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<PreviewRenderer | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);
  /** Bumped by Try again: remounts the canvas (a canvas whose context failed cannot be reused) and recreates. */
  const [attempt, setAttempt] = useState(0);
  /** Bumped when a renderer becomes ready, so its first frame is requested. */
  const [generation, setGeneration] = useState(0);

  const [live, setLive] = useState<LiveTransform | null>(null);
  const shown = useMemo(() => (live ? withClipTransform(project, live.clipId, live.transform) : project), [project, live]);

  const room = { width: Math.max(0, size.width - 2 * HANDLE_ROOM), height: Math.max(0, size.height - 2 * HANDLE_ROOM) };
  const box = fitBox(room, project.format);
  // The canvas is centred in the stage (flex), so its content box starts half the spare room in.
  const canvasBox = { left: (size.width - box.width) / 2, top: (size.height - box.height) / 2, ...box };
  const pixels = previewSize(project.format);

  // One renderer per mount (and per Try again); StrictMode's extra mount/unmount disposes the first, so no GL
  // objects leak. Try again disposes the old renderer (cleanup) before creating one on the fresh canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let renderer: PreviewRenderer | null = null;
    let cancelled = false;
    PreviewRenderer.create(canvas, {
      onSourceError: (name) => showError(`Could not open ${name} for the preview`),
      onFatal: (message) => {
        if (!cancelled) setFailure({ message });
      },
    }).then(
      (r) => {
        if (cancelled) {
          r.dispose();
          return;
        }
        renderer = r;
        rendererRef.current = r;
        setFailure(null);
        setGeneration((g) => g + 1);
      },
      // The panel shows the reason; the rest of the editor keeps working without a preview.
      (e: unknown) => {
        if (cancelled) return;
        setFailure(e instanceof ChunkLoadError ? { message: e.message } : glFailure(e));
      },
    );
    return () => {
      cancelled = true;
      if (renderer && rendererRef.current === renderer) rendererRef.current = null;
      renderer?.dispose();
    };
  }, [attempt]);

  // Resizing clears the canvas, so a size change always comes with a fresh render request.
  useEffect(() => {
    const r = rendererRef.current;
    if (!r) return;
    r.resize(pixels.width, pixels.height);
    r.request(shown, playhead);
  }, [shown, playhead, pixels.width, pixels.height, generation]);

  return (
    <section className="preview" aria-label="Preview">
      <div className="preview-stage" ref={stageRef}>
        <canvas
          key={attempt}
          ref={canvasRef}
          className="preview-canvas"
          data-testid="preview-canvas"
          width={pixels.width}
          height={pixels.height}
          style={{ width: box.width, height: box.height, display: failure ? 'none' : undefined }}
        />
        {editable && !failure && (
          <TransformOverlay project={project} playhead={playhead} box={canvasBox} canvasRef={canvasRef} live={live} onLive={setLive} />
        )}
        {failure && 'message' in failure && (
          <p className="preview-message" role="status" data-testid="preview-unavailable">
            {failure.message}
          </p>
        )}
        {failure && 'gl' in failure && (
          <PreviewFailure
            view={failure.gl}
            onRetry={() => {
              setFailure(null);
              setAttempt((a) => a + 1);
            }}
          />
        )}
      </div>
    </section>
  );
}
