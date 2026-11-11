// The export's WebGL compositor (split out of exporter.ts): the first canvas kind that starts WebGL2 wins.
import type { Compositor } from '../render/compositor';
import { graphicsHint, isNoWebGl2, plainReason, toGlUnavailable } from '../render/glErrors';
import { ExportError } from './errors';

type RenderCanvas = HTMLCanvasElement | OffscreenCanvas;

interface CanvasOption {
  label: string;
  make(): RenderCanvas;
}

/** OffscreenCanvas when the browser has it, then a detached HTMLCanvasElement. */
function defaultCanvases(width: number, height: number): CanvasOption[] {
  const list: CanvasOption[] = [];
  if (typeof OffscreenCanvas !== 'undefined') list.push({ label: 'OffscreenCanvas', make: () => new OffscreenCanvas(width, height) });
  list.push({ label: 'canvas', make: () => document.createElement('canvas') });
  return list;
}

/**
 * Creates the render compositor on the first of `canvases` that supports WebGL2. If none does, throws an
 * ExportError naming the last failure's plain-English reason (plus what to check when WebGL2 is missing); every
 * failure is logged with console.warn and listed in the error's `detail`.
 */
export function createExportCompositor(
  create: (canvas: RenderCanvas, opts: { preserveDrawingBuffer: boolean }) => Compositor,
  width: number,
  height: number,
  canvases: CanvasOption[] = defaultCanvases(width, height),
): Compositor {
  let compositor: Compositor | null = null;
  const failures: { label: string; error: unknown }[] = [];
  for (const { label, make } of canvases) {
    try {
      compositor = create(make(), { preserveDrawingBuffer: true });
      break;
    } catch (e) {
      failures.push({ label, error: e });
    }
  }
  if (!compositor) {
    const detail = failures.map(({ label, error }) => {
      console.warn(`clipforge: export renderer could not start on ${label}`, error);
      const g = toGlUnavailable(error);
      return `${label}: ${g.reason === 'unknown' ? '' : `${g.reason}: `}${g.message}`;
    });
    const err = toGlUnavailable(failures.at(-1)?.error ?? new Error('no canvas to render on'));
    const ua = typeof navigator === 'undefined' ? '' : navigator.userAgent;
    const hint = isNoWebGl2(err.reason) ? ` ${graphicsHint(ua)}` : '';
    throw new ExportError(`The video renderer could not start: ${plainReason(err.reason)}.${hint}`, detail.join('\n'));
  }
  try {
    compositor.resize(width, height);
  } catch (e) {
    compositor.dispose();
    throw e;
  }
  return compositor;
}
