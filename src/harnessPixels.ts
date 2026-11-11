// Pixel read-back for the dev harness (not part of the app build).

/** Reads the whole drawing buffer of a canvas with a WebGL2 context, top row first. */
export function readPixels(canvas: HTMLCanvasElement): { width: number; height: number; data: number[] } {
  const gl = canvas.getContext('webgl2');
  if (!gl) throw new Error('canvas has no WebGL2 context');
  const { width, height } = canvas;
  const raw = new Uint8Array(width * height * 4);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, raw);
  const data: number[] = new Array(raw.length);
  const row = width * 4;
  for (let y = 0; y < height; y++) {
    const src = (height - 1 - y) * row;
    for (let i = 0; i < row; i++) data[y * row + i] = raw[src + i];
  }
  return { width, height, data };
}
