import { afterEach, describe, it, expect, vi } from 'vitest';
import { GlUnavailableError, LEGACY_UNAVAILABLE, plainReason, toGlUnavailable } from '../src/render/glErrors';
import { acquireWebGl2, contextAttempts } from '../src/render/glContext';
import { buildDetailsText, describeGlFailure, graphicsHint } from '../src/ui/previewFailure';
import { createExportCompositor, ExportError } from '../src/export/exporter';
import type { Compositor } from '../src/render/compositor';

const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36';
const FIREFOX_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.0; rv:140.0) Gecko/20100101 Firefox/140.0';

/** A canvas whose getContext answers from `answer` and records every call. */
function fakeCanvas(answer: (type: string, attrs?: object) => unknown) {
  const calls: { type: string; attrs?: object }[] = [];
  return {
    calls,
    getContext(type: string, attrs?: object) {
      calls.push({ type, attrs });
      return answer(type, attrs);
    },
  };
}

describe('toGlUnavailable', () => {
  it('passes a GlUnavailableError through', () => {
    const e = new GlUnavailableError('shader', 'Shader compile failed', 'ERROR: 0:1: x');
    expect(toGlUnavailable(e)).toBe(e);
  });

  it('classifies other errors as unknown, keeping the message and cause', () => {
    const raw = new TypeError('x is null');
    const e = toGlUnavailable(raw);
    expect(e).toBeInstanceOf(GlUnavailableError);
    expect(e.reason).toBe('unknown');
    expect(e.message).toBe('x is null');
    expect(e.cause).toBe(raw);
    expect(toGlUnavailable('boom').message).toBe('boom');
  });

  it('gives each reason a plain-English text', () => {
    for (const r of ['no-webgl2-api', 'context-null', 'shader', 'resource', 'unknown'] as const) {
      expect(plainReason(r).length).toBeGreaterThan(10);
    }
    expect(plainReason('context-null')).toMatch(/^WebGL2 is not available/);
  });
});

describe('acquireWebGl2', () => {
  it('uses the compositor attributes when they work (one call)', () => {
    const gl = {};
    const c = fakeCanvas(() => gl);
    const r = acquireWebGl2(c, { preserveDrawingBuffer: true }, true);
    expect(r.gl).toBe(gl);
    expect(c.calls).toEqual([{ type: 'webgl2', attrs: contextAttempts(true)[0] }]);
    expect(c.calls[0].attrs).toMatchObject({ alpha: false, preserveDrawingBuffer: true });
    expect(r.attempts).toHaveLength(1);
    expect(r.attempts[0]).toMatch(/ok$/);
  });

  it('retries with preserveDrawingBuffer only, then with no attributes', () => {
    const gl = {};
    const c = fakeCanvas((_t, attrs) => (attrs === undefined ? gl : null));
    const r = acquireWebGl2(c, { preserveDrawingBuffer: false }, true);
    expect(r.gl).toBe(gl);
    expect(c.calls.map((x) => x.attrs)).toEqual([contextAttempts(false)[0], { preserveDrawingBuffer: false }, undefined]);
    expect(r.attempts.map((a) => a.split(': ').pop())).toEqual(['null', 'null', 'ok']);
  });

  it('stops at the second attempt when it works', () => {
    const gl = {};
    const c = fakeCanvas((_t, attrs) => (attrs && Object.keys(attrs).length === 1 ? gl : null));
    expect(acquireWebGl2(c, { preserveDrawingBuffer: true }, true).gl).toBe(gl);
    expect(c.calls).toHaveLength(2);
  });

  it('throws context-null with every attempt recorded when all fail', () => {
    const c = fakeCanvas(() => null);
    let err: unknown;
    try {
      acquireWebGl2(c, {}, true);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(GlUnavailableError);
    expect((err as GlUnavailableError).reason).toBe('context-null');
    expect((err as GlUnavailableError).attempts).toHaveLength(3);
  });

  it('does not retry on a canvas that already returned a context', () => {
    let first = true;
    const c = fakeCanvas(() => {
      const r = first ? {} : null;
      first = false;
      return r;
    });
    acquireWebGl2(c, {}, true);
    expect(() => acquireWebGl2(c, {}, true)).toThrow(GlUnavailableError);
    expect(c.calls).toHaveLength(2);
  });

  it('reports no-webgl2-api without touching the canvas when the API is missing', () => {
    const c = fakeCanvas(() => ({}));
    expect(() => acquireWebGl2(c, {}, false)).toThrow(expect.objectContaining({ reason: 'no-webgl2-api' }));
    expect(c.calls).toHaveLength(0);
  });

  it('treats a throwing getContext as a failed attempt', () => {
    const c = fakeCanvas(() => {
      throw new Error('blocked');
    });
    expect(() => acquireWebGl2(c, {}, true)).toThrow(expect.objectContaining({ reason: 'context-null' }));
    expect(c.calls).toHaveLength(3);
  });
});

describe('preview failure text', () => {
  it('keeps the legacy sentence and the Chrome hint for a missing context', () => {
    const f = describeGlFailure(new GlUnavailableError('context-null', 'getContext returned null'), CHROME_UA);
    expect(f.headline).toBe(`The preview could not start: ${LEGACY_UNAVAILABLE}`);
    expect(f.hint).toContain('chrome://gpu');
    expect(f.hint).toContain('Chrome Settings → System');
  });

  it('uses a generic hint outside Chrome', () => {
    expect(graphicsHint(FIREFOX_UA)).not.toContain('chrome://');
    expect(graphicsHint(FIREFOX_UA)).toContain("your browser's graphics settings");
  });

  it('names the shader failure in plain English', () => {
    const f = describeGlFailure(new GlUnavailableError('shader', 'Shader compile failed', 'ERROR: bad'), CHROME_UA);
    expect(f.headline).toBe(`The preview could not start: ${plainReason('shader')}.`);
    expect(f.headline).not.toContain(LEGACY_UNAVAILABLE);
  });

  it('builds a details text with reason, info log, attempts, renderer and user agent', () => {
    const e = new GlUnavailableError('shader', 'Shader compile failed', 'ERROR: 0:3: syntax');
    e.attempts = ['webgl2 {alpha:false}: ok'];
    const text = buildDetailsText(e, { userAgent: CHROME_UA, renderer: { renderer: 'ANGLE (Apple M1)', vendor: 'Apple' } });
    for (const s of ['Reason: shader', 'Shader compile failed', 'ERROR: 0:3: syntax', 'webgl2 {alpha:false}: ok', 'ANGLE (Apple M1)', 'Apple', CHROME_UA]) {
      expect(text).toContain(s);
    }
  });

  it('says when the renderer could not be read', () => {
    const e = new GlUnavailableError('context-null', 'getContext returned null');
    expect(buildDetailsText(e, { userAgent: 'UA', renderer: { error: 'no context' } })).toContain('WebGL renderer: unavailable (no context)');
  });
});

describe('createExportCompositor', () => {
  afterEach(() => vi.restoreAllMocks());
  const fake = { resize() {}, dispose() {} } as unknown as Compositor;

  it('turns a GL failure into an ExportError with the plain-English reason', () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const create = () => {
      throw new GlUnavailableError('context-null', 'getContext returned null');
    };
    let err: unknown;
    try {
      createExportCompositor(create, 10, 10, [() => ({}) as OffscreenCanvas, () => ({}) as HTMLCanvasElement]);
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ExportError);
    expect((err as Error).message).toContain(plainReason('context-null'));
    expect((err as Error).message).toMatch(/^The video renderer could not start/);
    expect(logged).toHaveBeenCalledWith('clipforge: export renderer could not start', expect.any(GlUnavailableError));
  });

  it('falls back to the next canvas', () => {
    let n = 0;
    const create = () => {
      if (n++ === 0) throw new Error('offscreen failed');
      return fake;
    };
    expect(createExportCompositor(create, 10, 10, [() => ({}) as OffscreenCanvas, () => ({}) as HTMLCanvasElement])).toBe(fake);
  });
});
