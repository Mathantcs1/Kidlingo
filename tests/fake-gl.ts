// A recording fake WebGL2 context for pure tests of GL-driving code.

type Call = [string, unknown[]];

/**
 * A fake WebGL2 context: each constant is a unique number (`k(name)`), every method call is recorded with its
 * arguments and answered by `answers`; create* return fresh objects.
 */
export function fakeGl(answers: Record<string, (...a: unknown[]) => unknown> = {}) {
  const log: Call[] = [];
  const consts = new Map<string, number>();
  const k = (name: string): number => {
    if (!consts.has(name)) consts.set(name, 1000 + consts.size);
    return consts.get(name)!;
  };
  let seq = 0;
  /** Set `lost` to simulate a lost context: isContextLost() is true, getParameter/create* return null. */
  const state = { lost: false };
  const gl = new Proxy({} as Record<string, unknown>, {
    get(_t, prop: string) {
      if (/^[A-Z0-9_]+$/.test(prop)) return k(prop);
      return (...a: unknown[]) => {
        log.push([prop, a]);
        if (answers[prop]) return answers[prop](...a);
        if (prop === 'isContextLost') return state.lost;
        if (state.lost && (prop.startsWith('create') || prop === 'getParameter')) return null;
        if (prop.startsWith('create')) return { kind: prop, id: ++seq };
        if (prop === 'getShaderParameter' || prop === 'getProgramParameter') return true;
        if (prop === 'getParameter') {
          if (a[0] === k('VIEWPORT')) return new Int32Array([0, 0, 8, 8]);
          if (a[0] === k('MAX_TEXTURE_SIZE')) return 4096;
          if (a[0] === k('ACTIVE_TEXTURE')) return k('TEXTURE0');
        }
        return null;
      };
    },
  });
  return { gl: gl as unknown as WebGL2RenderingContext, log, calls: () => log.map(([n]) => n), count: (n: string) => log.filter(([c]) => c === n).length, k, state };
}
