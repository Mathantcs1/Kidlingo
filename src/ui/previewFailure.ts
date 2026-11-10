// Wording and diagnostics for a preview that could not start. Everything except probeRenderer is pure.
import { LEGACY_UNAVAILABLE, graphicsHint, isNoWebGl2, plainReason } from '../render/glErrors';
import type { GlUnavailableError } from '../render/glErrors';

/** The GPU behind WebGL, as far as the browser tells (or why it could not be read). */
export type RendererInfo = { renderer: string; vendor: string } | { error: string };

export { graphicsHint };

export interface PreviewFailureText {
  headline: string;
  hint: string;
}

/** The headline and hint shown in the preview panel for `e`. */
export function describeGlFailure(e: GlUnavailableError, userAgent: string): PreviewFailureText {
  if (isNoWebGl2(e.reason)) {
    return { headline: `The preview could not start: ${LEGACY_UNAVAILABLE}`, hint: graphicsHint(userAgent) };
  }
  return {
    headline: `The preview could not start: ${plainReason(e.reason)}.`,
    hint: 'Try again, or reload the page. If it keeps failing, copy the details and send them to us.',
  };
}

/** The technical details (for the collapsed panel and "Copy details"). */
export function buildDetailsText(e: GlUnavailableError, env: { userAgent: string; renderer: RendererInfo }): string {
  const lines = [`Reason: ${e.reason} (${plainReason(e.reason)})`, `Error: ${e.message}`];
  if (e.log) lines.push(`GL info log: ${e.log.trim()}`);
  const cause = e.cause instanceof Error ? e.cause.stack ?? e.cause.message : undefined;
  if (cause && cause !== e.message) lines.push(`Cause: ${cause}`);
  lines.push('canvas.getContext outcomes:', ...(e.attempts.length ? e.attempts : ['(none recorded)']).map((a) => `  ${a}`));
  const r = env.renderer;
  lines.push('error' in r ? `WebGL renderer: unavailable (${r.error})` : `WebGL renderer: ${r.renderer}\nWebGL vendor: ${r.vendor}`);
  lines.push(`User agent: ${env.userAgent}`);
  return lines.join('\n');
}

/**
 * Reads the GPU renderer/vendor strings through a throwaway canvas (WebGL2, else WebGL1) and the
 * WEBGL_debug_renderer_info extension, then releases that context. Never throws.
 */
export function probeRenderer(doc: Document = document): RendererInfo {
  try {
    const canvas = doc.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    if (!gl) return { error: 'no WebGL context on a test canvas either' };
    try {
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
      const vendor = String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR));
      return { renderer, vendor };
    } finally {
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
