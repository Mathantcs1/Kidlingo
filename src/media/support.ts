/** True when the environment exposes the WebCodecs video decoder and encoder. */
export function hasWebCodecs(g: typeof globalThis = globalThis): boolean {
  return 'VideoDecoder' in g && 'VideoEncoder' in g;
}
