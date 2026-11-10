// Getting a WebGL2 context, tolerantly: the compositor's preferred attributes first, then looser ones. Pure (the
// canvas is passed in), so the retry order is unit-tested with fake canvases.
import { GlUnavailableError } from './glErrors';

export interface ContextCanvas {
  getContext(type: string, attrs?: object): unknown;
}

/** Canvases that already handed us a context: a later null means something else is wrong, so no retries there. */
const hadContext = new WeakSet<object>();

/**
 * The attribute sets tried in order: the compositor's preferred ones, then only preserveDrawingBuffer (which the
 * preview and export read-back need, so it is never dropped). Some drivers refuse e.g. alpha:false; the compositor
 * stays correct with either (see compositor).
 */
export function contextAttempts(preserveDrawingBuffer: boolean): WebGLContextAttributes[] {
  return [
    { alpha: false, antialias: false, depth: false, stencil: false, premultipliedAlpha: true, preserveDrawingBuffer },
    { preserveDrawingBuffer },
  ];
}

function describeAttrs(attrs: object): string {
  return `{${Object.entries(attrs).map(([k, v]) => `${k}:${String(v)}`).join(', ')}}`;
}

function isLost(gl: unknown): boolean {
  const ctx = gl as { isContextLost?: () => boolean };
  return typeof ctx.isContextLost === 'function' && ctx.isContextLost();
}

/**
 * Returns a WebGL2 context of `canvas` and a log line per getContext call ("webgl2 {…}: ok|null|lost|threw …").
 * `apiPresent` is `typeof WebGL2RenderingContext !== 'undefined'`. Throws GlUnavailableError 'no-webgl2-api'
 * (canvas untouched), 'context-null' or 'context-lost' (with the log in `attempts`).
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
      gl = canvas.getContext('webgl2', attrs);
      outcome = !gl ? 'null' : isLost(gl) ? 'lost' : 'ok';
    } catch (e) {
      outcome = `threw ${e instanceof Error ? e.message : String(e)}`;
    }
    attempts.push(`webgl2 ${describeAttrs(attrs)}: ${outcome}`);
    if (!gl) continue;
    hadContext.add(canvas);
    // The canvas now holds this context and would hand it back to every retry, so a lost one is final.
    if (outcome === 'lost') {
      const e = new GlUnavailableError('context-lost', 'canvas.getContext(\'webgl2\') returned a context that is already lost');
      e.attempts = attempts;
      throw e;
    }
    return { gl: gl as WebGL2RenderingContext, attempts };
  }
  const e = new GlUnavailableError('context-null', `canvas.getContext('webgl2') returned null (${attempts.length} attempts)`);
  e.attempts = attempts;
  throw e;
}
