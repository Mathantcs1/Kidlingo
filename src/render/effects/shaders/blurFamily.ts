// The blur family (Plan 4 Task 7): blur, sharpen (unsharp mask), glow and pixelate. Kernels, sizes and constants are
// in ../blurMath.ts and the CPU references in ../blurRef.ts. Every blur pass is one direction of one stage of
// blurStages(radius) on PREMULTIPLIED values, CLAMP_TO_EDGE at the picture's edges; the taps are uploaded as float
// arrays. Strength 0 (blur radius 0, sharpen amount 0, glow intensity or radius 0, pixelate size 1) draws no pass.
//
//   blur      H, V per stage (2 passes; 4 beyond the tap cap).
//   sharpen   blur of the input, then in the last V pass: c + amount·(c − blurred) on STRAIGHT colour, where the
//             blurred straight colour is blurred premultiplied / blurred alpha (an alpha-weighted mean, so transparent
//             neighbours add no colour: no halo); alpha untouched, clamped 0..1.
//   glow      bright pass m = smoothstep(threshold, threshold + GLOW_KNEE, luma(c)) → (c·a·m, a·m), its blur, then in
//             the last V pass with g = intensity·blurred: a' = clamp(a + g.a·(1 − a)), rgb' = min(rgb + g.rgb, a')
//             (additive light, premultiplied-valid; spreads a soft glow of alpha g.a over transparent areas).
//   pixelate  blocks of pixelBlock(size) working pixels anchored at the top-left; each takes the nearest pixel to the
//             block centre (clamped to the picture for the partial last blocks; sampled LINEAR at that pixel's centre,
//             so exact when source texels = working pixels, see below). 1 pass.
// The first pass samples the clip's input through its uv matrix (rotation/mirror), so the blur step in source uv is
// the linear part of u_uv applied to one working pixel. When the source has MORE texels than the working size (the
// working size is capped at 2× the format's long side) the first H pass and pixelate's block centre sample the source
// with LINEAR filtering, i.e. a bilinear mix of source texels rather than the exact taps / the nearest texel: an
// accepted approximation (exact when texels = working pixels, as in every drift guard).
//
// Known limit (Task 11 adds the time guard): cost is not bounded per frame. Blur 100 on a 3840×2160 working size is
// sigma 100 → a pre-blur stage (31 reads) and a strided stage (61 reads), H and V: 184 reads per pixel, ≈ 1.5 G texture
// fetches per blur; a maximal stack of 8 is ≈ 12 G fetches per frame (GPU watchdog / lost-context risk on slow GPUs).
// Candidate fix: run the strided stage at 1/s resolution.
import { GLOW_KNEE, MAX_TAPS, BLOCK_EPS, blurRadius, blurStages, pixelBlock } from '../blurMath';
import type { PassRunner, PassShader, Uniforms } from '../types';
import { GLSL_HEADER, GLSL_LUMA, GLSL_PREMULTIPLY, f } from './glsl';

const num = (v: number | undefined): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const MODE = { blur: 0, composite: 1, bright: 2 };

/** blur1d(): one direction (u_dir) of one stage; inputAt(): the effect's input here (PassOptions.input). */
const GLSL_BLUR = `
uniform mat3 u_uv;
uniform vec2 u_size;
uniform vec2 u_dir;
uniform float u_n;
uniform float u_off[${MAX_TAPS}];
uniform float u_w[${MAX_TAPS}];
uniform float u_mode;
uniform sampler2D u_input;
uniform vec3 u_inputX;
uniform vec3 u_inputY;
${GLSL_LUMA}${GLSL_PREMULTIPLY}
vec4 blur1d() {
  vec2 stepUv = (u_uv * vec3(u_dir / u_size, 0.0)).xy;
  vec4 sum = vec4(0.0);
  for (int i = 0; i < ${MAX_TAPS}; i++) {
    if (float(i) >= u_n) break;
    sum += u_w[i] * texture(u_src, v_uv + stepUv * u_off[i]);
  }
  return sum;
}

vec4 inputAt() {
  vec3 p = vec3(v_uv, 1.0);
  return texture(u_input, vec2(dot(u_inputX, p), dot(u_inputY, p)));
}`;

/**
 * Draws each stage's H and V pass; with `last`, the final V pass also gets `last` (its composite uniforms) and the
 * effect's input.
 */
function blurPasses(pass: PassRunner, radius: number, height: number, last?: Uniforms): void {
  const stages = blurStages(blurRadius(radius, height));
  stages.forEach((k, i) => {
    const taps = { u_n: k.offsets.length, u_off: Float32Array.from(k.offsets), u_w: Float32Array.from(k.weights) };
    pass.draw({ ...taps, u_dir: [1, 0], u_mode: MODE.blur });
    const final = last && i === stages.length - 1;
    pass.draw({ ...taps, u_dir: [0, 1], u_mode: MODE.blur, ...(final ? last : {}) }, final ? { input: true } : undefined);
  });
}

export const BLUR: PassShader = {
  fragment: `${GLSL_HEADER}${GLSL_BLUR}
void main() {
  outColor = blur1d();
}`,
  uniforms: () => ({}),
  run: (pass, p, _ctx, size) => blurPasses(pass, num(p.radius), size.height),
};

export const SHARPEN: PassShader = {
  fragment: `${GLSL_HEADER}${GLSL_BLUR}
uniform float u_amount;
void main() {
  vec4 b = blur1d();
  if (u_mode < 0.5) {
    outColor = b;
    return;
  }
  vec4 s = inputAt();
  vec3 c = unpremultiply(s);
  vec3 bc = b.a > 0.0 ? unpremultiply(b) : c;
  outColor = premultiply(clamp(c + u_amount * (c - bc), 0.0, 1.0), s.a);
}`,
  uniforms: () => ({}),
  run: (pass, p, _ctx, size) => {
    if (num(p.amount) <= 0) return;
    blurPasses(pass, num(p.radius), size.height, { u_mode: MODE.composite, u_amount: num(p.amount) });
  },
};

export const GLOW: PassShader = {
  fragment: `${GLSL_HEADER}${GLSL_BLUR}
uniform float u_threshold;
uniform float u_intensity;
void main() {
  if (u_mode > 1.5) {
    vec4 s = texture(u_src, v_uv);
    vec3 c = unpremultiply(s);
    float m = smoothstep(u_threshold, u_threshold + ${f(GLOW_KNEE)}, dot(c, LUMA));
    outColor = vec4(c * (s.a * m), s.a * m);
    return;
  }
  vec4 b = blur1d();
  if (u_mode < 0.5) {
    outColor = b;
    return;
  }
  vec4 s = inputAt();
  vec4 g = u_intensity * b;
  float a = clamp(s.a + g.a * (1.0 - s.a), 0.0, 1.0);
  outColor = vec4(min(s.rgb + g.rgb, vec3(a)), a);
}`,
  uniforms: () => ({}),
  run: (pass, p, _ctx, size) => {
    const radius = blurRadius(num(p.radius), size.height);
    if (num(p.intensity) <= 0 || blurStages(radius).length === 0) return;
    pass.draw({ u_mode: MODE.bright, u_threshold: num(p.threshold) });
    blurPasses(pass, num(p.radius), size.height, { u_mode: MODE.composite, u_intensity: num(p.intensity) });
  },
};

export const PIXELATE: PassShader = {
  fragment: `${GLSL_HEADER}
uniform mat3 u_uv;
uniform vec2 u_size;
uniform float u_block;
uniform float u_invBlock;
void main() {
  vec2 b = floor(gl_FragCoord.xy * u_invBlock + ${f(BLOCK_EPS)});
  vec2 c = min(floor((b + 0.5) * u_block), u_size - 1.0);
  outColor = texture(u_src, (u_uv * vec3((c + 0.5) / u_size, 1.0)).xy);
}`,
  uniforms: () => ({}),
  run: (pass, p, _ctx, size) => {
    const block = pixelBlock(num(p.size), size.height);
    if (block > 1) pass.draw({ u_block: Math.fround(block), u_invBlock: Math.fround(1 / block) });
  },
};
