// The GL program of the composite's blend pass (see CompositeBuffer.blend and ./effects/shaders/blend.ts).
import { PASS_VERTEX } from './effects/programs';
import { createUnitQuad } from './effects/passResources';
import { BLEND_FRAGMENT } from './effects/shaders/blend';
import { createProgram } from './gl';

export interface BlendProgram {
  program: WebGLProgram;
  vao: WebGLVertexArrayObject;
  buffer: WebGLBuffer;
  /** A uniform's location (cached). */
  at(name: string): WebGLUniformLocation | null;
  dispose(): void;
}

let fragmentOverride: string | null = null;
/** TEST-ONLY (the DEV hook): compiles `source` instead of the real blend shader (null restores it). */
export function setBlendFragmentOverride(source: string | null): void {
  fragmentOverride = source;
}

/** Compiles the blend pass (backdrop on unit 0, layer on unit 1) with its unit quad. Throws like createProgram. */
export function createBlendProgram(gl: WebGL2RenderingContext): BlendProgram {
  const program = createProgram(gl, PASS_VERTEX, fragmentOverride ?? BLEND_FRAGMENT);
  let quad: { vao: WebGLVertexArrayObject; buffer: WebGLBuffer };
  try {
    quad = createUnitQuad(gl);
  } catch (e) {
    gl.deleteProgram(program);
    throw e;
  }
  const locations = new Map<string, WebGLUniformLocation | null>();
  const at = (name: string): WebGLUniformLocation | null => {
    if (!locations.has(name)) locations.set(name, gl.getUniformLocation(program, name));
    return locations.get(name) ?? null;
  };
  gl.useProgram(program);
  gl.uniform1i(at('u_backdrop'), 0);
  gl.uniform1i(at('u_layer'), 1);
  return {
    program,
    ...quad,
    at,
    dispose: () => {
      gl.deleteProgram(program);
      gl.deleteVertexArray(quad.vao);
      gl.deleteBuffer(quad.buffer);
    },
  };
}
