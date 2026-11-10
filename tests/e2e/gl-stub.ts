// Stubs for WebGL2 failure modes, installed with page.addInitScript and flipped at run time.
import type { Page } from '@playwright/test';

export interface GlStub {
  /** getContext('webgl2') returns null (HTMLCanvasElement and OffscreenCanvas). */
  noWebGl2: boolean;
  /** getContext('webgl2', { alpha: false, … }) returns null, so the compositor falls back to looser attributes. */
  noAlphaFalse: boolean;
  /** Every shader compile fails with STUB_LOG as its info log. */
  shaderFail: boolean;
}

export const STUB_LOG = 'ERROR: 0:1: stub compile failure';

/** Installs the stubs before any page script; flip them later with setStub. */
export async function stubGl(page: Page, stub: Partial<GlStub>): Promise<void> {
  await page.addInitScript(
    ([initial, log]) => {
      const w = window as unknown as { __cfGl: GlStub };
      w.__cfGl = { noWebGl2: false, noAlphaFalse: false, shaderFail: false, ...initial };
      type GetContext = (this: unknown, type: string, ...rest: unknown[]) => unknown;
      const withContext = new WeakSet<object>();
      const patch = (proto: { getContext: unknown }): void => {
        const original = proto.getContext as GetContext;
        proto.getContext = function (this: object, type: string, ...rest: unknown[]) {
          const attrs = rest[0] as { alpha?: boolean } | undefined;
          if (type === 'webgl2' && w.__cfGl.noWebGl2) return null;
          // Like a real driver: a canvas that already has its context gets it back whatever the attributes.
          if (type === 'webgl2' && w.__cfGl.noAlphaFalse && attrs?.alpha === false && !withContext.has(this)) return null;
          const ctx = original.call(this, type, ...rest);
          if (ctx) withContext.add(this);
          return ctx;
        };
      };
      patch(HTMLCanvasElement.prototype);
      if (typeof OffscreenCanvas !== 'undefined') patch(OffscreenCanvas.prototype);
      const proto = WebGL2RenderingContext.prototype;
      const getParam = proto.getShaderParameter;
      const getLog = proto.getShaderInfoLog;
      proto.getShaderParameter = function (shader: WebGLShader, pname: number) {
        if (w.__cfGl.shaderFail && pname === this.COMPILE_STATUS) return false;
        return getParam.call(this, shader, pname);
      };
      proto.getShaderInfoLog = function (shader: WebGLShader) {
        return w.__cfGl.shaderFail ? log : getLog.call(this, shader);
      };
    },
    [stub, STUB_LOG] as const,
  );
}

export function setStub(page: Page, stub: Partial<GlStub>): Promise<void> {
  return page.evaluate((s) => {
    const w = window as unknown as { __cfGl: GlStub };
    Object.assign(w.__cfGl, s);
  }, stub);
}
