// The template every effect shader module follows: a fragment shader plus its params → uniforms mapping.
// Not registered for any type; the dev harness uses it as a test-only effect (output = input, one pass).
import type { PassShader } from '../types';

export const PASSTHROUGH: PassShader = {
  fragment: `#version 300 es
precision highp float;
in vec2 v_uv;
uniform sampler2D u_src;
out vec4 outColor;
void main() {
  outColor = texture(u_src, v_uv);
}`,
  uniforms: () => ({}),
};
