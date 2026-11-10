import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useEditor } from '../state/store';
import { fitBox, previewSize } from './layout';
import { PreviewRenderer } from './previewRenderer';
import { showError } from './Toast';
import { ChunkLoadError } from '../loadChunk';
import { toGlUnavailable } from '../render/glErrors';
import { buildDetailsText, describeGlFailure, probeRenderer } from './previewFailure';
import { PreviewFailure } from './PreviewFailure';
import type { GlFailureView } from './PreviewFailure';

/** A plain message (chunk reload, lost context), or a renderer start-up failure with details and Try again. */
type Failure = { message: string } | { gl: GlFailureView };

/** Logs the real error and turns it into the panel's wording and technical details. */
function glFailure(e: unknown): Failure {
  console.error('clipforge: preview could not start', e);
  const err = toGlUnavailable(e);
  const userAgent = navigator.userAgent;
  return { gl: { ...describeGlFailure(err, userAgent), details: buildDetailsText(err, { userAgent, renderer: probeRenderer() }) } };
}

/** Tracks the content-box size of an element. */
function useElementSize<T extends HTMLElement>(): [RefObject<T | null>, { width: number; height: number }] {
  const ref = useRef<T>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = (): void => setSize({ width: el.clientWidth, height: el.clientHeight });
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/**
 * The preview panel: a WebGL canvas at the project's aspect ratio, fitted to the panel, showing the frame
 * under the playhead. It re-renders on playhead, project, format and size changes (latest request wins).
 */
export default function Preview() {
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

  const box = fitBox(size, project.format);
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
    r.request(project, playhead);
  }, [project, playhead, pixels.width, pixels.height, generation]);

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
