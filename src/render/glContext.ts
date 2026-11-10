// Getting a WebGL2 context, tolerantly: the compositor's preferred attributes first, then looser ones. Pure (the
// canvas is passed in), so the retry order is unit-tested with fake canvases.
import { GlUnavailableError } from './glErrors';

export interface ContextCanvas {
  getContext(type: string, attrs?: object): unknown;
}

/** Canvases that already handed us a context: a later null means something else is wrong, so no retries there. */
const hadContext = new WeakSet<object>();

/**
 * The attribute sets tried in order: the compositor's preferred ones, then only preserveDrawingBuffer, then none
 * (undefined). Some drivers refuse e.g. alpha:false; the compositor stays correct with any of them (see compositor).
 */
export function contextAttempts(preserveDrawingBuffer: boolean): (WebGLContextAttributes | undefined)[] {
  return [
    { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer },
    { preserveDrawingBuffer },
    undefined,
  ];
}

function describeAttrs(attrs: object | undefined): string {
  if (!attrs) return '(no attributes)';
  return `{${Object.entries(attrs).map(([k, v]) => `${k}:${String(v)}`).join(', ')}}`;
}

/**
 * Returns a WebGL2 context of `canvas` and a log line per getContext call ("webgl2 {…}: ok|null|threw …").
 * `apiPresent` is `typeof WebGL2RenderingContext !== 'undefined'`. Throws GlUnavailableError 'no-webgl2-api'
 * (canvas untouched) or 'context-null' (with the log in `attempts`).
 */
export function acquireWebGl2(
  canvas: ContextCanvas,
  opts: { preserveDrawingBuffer?: boolean },
  apiPresent: boolean,
): { gl: WebGL2RenderingContext; attempts: string[] } {
  if (!apiPresent) {
    const e = new GlUnavailableError('no-webgl2-api', 'WebGL2RenderingContext is not defined in this browser');
    e.attempts = ['webgl2: not attempted (no WebGL2 API)'];
    throw e;
  }
  const attempts: string[] = [];
  // A canvas that already gave us a context returns that same context; a null now is not worth retrying.
  const tries = contextAttempts(opts.preserveDrawingBuffer ?? false).slice(0, hadContext.has(canvas) ? 1 : undefined);
  for (const attrs of tries) {
    let gl: unknown = null;
    let outcome: string;
    try {
      gl = attrs === undefined ? canvas.getContext('webgl2') : canvas.getContext('webgl2', attrs);
      outcome = gl ? 'ok' : 'null';
    } catch (e) {
      outcome = `threw ${e instanceof Error ? e.message : String(e)}`;
    }
    attempts.push(`webgl2 ${describeAttrs(attrs)}: ${outcome}`);
    if (gl) {
      hadContext.add(canvas);
      return { gl: gl as WebGL2RenderingContext, attempts };
    }
  }
  const e = new GlUnavailableError('context-null', `canvas.getContext('webgl2') returned null (${attempts.length} attempts)`);
  e.attempts = attempts;
  throw e;
}
