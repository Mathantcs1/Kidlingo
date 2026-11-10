// Typed WebGL2 start-up failures, so the preview and the exporter can tell the user why the renderer could not
// start. Pure: no DOM or GL access, importable in Node.

export type GlFailureReason = 'no-webgl2-api' | 'context-null' | 'shader' | 'resource' | 'unknown';

/** The preview's historical message; kept verbatim for the "no WebGL2" reasons. */
export const LEGACY_UNAVAILABLE = 'WebGL2 is not available, so the preview cannot be shown.';

/** The renderer could not start. `log` holds the GL info log of a shader failure; `attempts` the getContext outcomes. */
export class GlUnavailableError extends Error {
  attempts: string[] = [];

  constructor(
    readonly reason: GlFailureReason,
    message: string,
    readonly log?: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'GlUnavailableError';
  }
}

const REASONS: Record<GlFailureReason, string> = {
  'no-webgl2-api': 'WebGL2 is not available (this browser does not support it)',
  'context-null': 'WebGL2 is not available (the browser refused to create a WebGL2 context; graphics acceleration may be off or blocked)',
  shader: "the graphics driver could not compile the renderer's shaders",
  resource: 'the graphics driver could not create the GPU resources the renderer needs',
  unknown: 'an unexpected graphics error occurred',
};

/** One plain-English clause (no trailing full stop) describing `reason`. */
export function plainReason(reason: GlFailureReason): string {
  return REASONS[reason];
}

/** True for the reasons where WebGL2 itself is missing (as opposed to failing later). */
export function isNoWebGl2(reason: GlFailureReason): boolean {
  return reason === 'no-webgl2-api' || reason === 'context-null';
}

function isChrome(userAgent: string): boolean {
  return /Chrome\/|CriOS\//.test(userAgent) && !/Edg\/|OPR\//.test(userAgent);
}

/** What to check when WebGL2 is missing: Chrome's own pages in Chrome, a generic pointer elsewhere. */
export function graphicsHint(userAgent: string): string {
  if (isChrome(userAgent)) {
    return "Check chrome://gpu: WebGL2 should say 'Hardware accelerated', and make sure graphics acceleration is on in Chrome Settings → System.";
  }
  return "Make sure hardware (graphics) acceleration is turned on in your browser's graphics settings.";
}

/** `e` as a GlUnavailableError: passed through if it already is one, else reason 'unknown' with `e` as the cause. */
export function toGlUnavailable(e: unknown): GlUnavailableError {
  if (e instanceof GlUnavailableError) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new GlUnavailableError('unknown', message, undefined, { cause: e });
}

/** Runs `make`; on failure runs `cleanup` and rethrows as a GlUnavailableError carrying `attempts`. */
export function withAttempts<T>(attempts: string[], make: () => T, cleanup?: () => void): T {
  try {
    return make();
  } catch (e) {
    cleanup?.();
    const err = toGlUnavailable(e);
    err.attempts = attempts;
    throw err;
  }
}
