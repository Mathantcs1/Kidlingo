// The GLSL twin of ../../transitionMath.ts (Plan 5C D6): reads the outgoing picture (`u_a`, unit 1) and the incoming one
// (`u_b`, unit 2), both full-frame layer targets (premultiplied, bottom row first), and writes the transition's picture; with
// `u_over` 1 it is drawn premultiplied-over the backdrop (`u_backdrop`, unit 0) instead, the fused Normal-mode pass (D8).
// Uses the pass vertex shader with an identity u_uv; frame position p = (v_uv.x, 1 − v_uv.y) (y down) as in the TS mirror.
import { GLITCH, TRAVEL } from '../../transitionMath';
import { GLSL_HASH, f } from './glsl';

/** Type numbers in the shader. */
export const TRANSITION_TYPE_INDEX = { dip: 0, dissolve: 1, wipe: 2, slide: 3, push: 4, zoom: 5, glitch: 6, audio: 1 } as const;
const dirs = Object.values(TRAVEL).map(([x, y]) => `vec2(${f(x)}, ${f(y)})`).join(', ');

export const TRANSITION_FRAGMENT = `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_backdrop;
uniform sampler2D u_a;
uniform sampler2D u_b;
uniform int u_type;
uniform int u_dir;
uniform int u_over;
uniform int u_frame;
uniform float u_e;
uniform float u_softness;
uniform float u_amount;
out vec4 outColor;
${GLSL_HASH}
const vec2 TRAVEL[4] = vec2[4](${dirs});

vec4 pic(sampler2D s, vec2 p) {
  if (p.x < 0.0 || p.x > 1.0 || p.y < 0.0 || p.y > 1.0) return vec4(0.0);
  return texture(s, vec2(p.x, 1.0 - p.y));
}
vec4 A(vec2 p) { return pic(u_a, p); }
vec4 B(vec2 p) { return pic(u_b, p); }
vec4 overPx(vec4 top, vec4 under) { return top + under * (1.0 - top.a); }

float wipeWeight(vec2 p) {
  vec2 d = TRAVEL[u_dir];
  float q = dot(p - 0.5, d) + 0.5;
  float c = -u_softness + u_e * (1.0 + 2.0 * u_softness);
  if (u_softness < 1e-6) return q < c ? 1.0 : 0.0;
  return 1.0 - smoothstep(c - u_softness, c + u_softness, q);
}

vec4 glitch(vec2 p) {
  uint frame = uint(max(u_frame, 0));
  uint bx = uint(floor(p.x * ${f(GLITCH.cols)}));
  uint by = uint(floor(p.y * ${f(GLITCH.rows)}));
  bool hit = hash(frame, bx, by + ${GLITCH.blockSalt}u) < u_e;
  uint line = uint(floor(p.y * ${f(GLITCH.lines)}));
  float s = sin(3.14159265358979 * u_e) * u_amount;
  float shift = (hash(frame, line, ${GLITCH.rowSalt}u) - 0.5) * ${f(GLITCH.shift)} * s;
  float k = ${f(GLITCH.split)} * s;
  vec4 g = hit ? B(p + vec2(shift, 0.0)) : A(p + vec2(shift, 0.0));
  vec4 r = hit ? B(p + vec2(shift + k, 0.0)) : A(p + vec2(shift + k, 0.0));
  vec4 bl = hit ? B(p + vec2(shift - k, 0.0)) : A(p + vec2(shift - k, 0.0));
  return vec4(r.r, g.g, bl.b, g.a);
}

void main() {
  vec2 p = vec2(v_uv.x, 1.0 - v_uv.y);
  vec2 t = TRAVEL[u_dir];
  vec4 o;
  if (u_type == 0) {
    vec4 q = u_e < 0.5 ? A(p) : B(p);
    float k = u_e < 0.5 ? 1.0 - 2.0 * u_e : 2.0 * u_e - 1.0;
    o = vec4(q.rgb * k, q.a);
  } else if (u_type == 2) {
    o = mix(A(p), B(p), wipeWeight(p));
  } else if (u_type == 3) {
    o = overPx(B(p + t * (1.0 - u_e)), A(p));
  } else if (u_type == 4) {
    o = overPx(B(p + t * (1.0 - u_e)), A(p - t * u_e));
  } else if (u_type == 5) {
    float sA = 1.0 + (u_amount - 1.0) * u_e;
    float sB = pow(u_amount, u_e - 1.0);
    float w = smoothstep(0.35, 0.65, u_e);
    o = mix(A(0.5 + (p - 0.5) / sA), B(0.5 + (p - 0.5) / sB), w);
  } else if (u_type == 6) {
    o = glitch(p);
  } else {
    o = mix(A(p), B(p), u_e);
  }
  outColor = u_over == 1 ? overPx(o, texture(u_backdrop, v_uv)) : o;
}`;
