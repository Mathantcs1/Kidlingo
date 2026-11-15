// Shared GLSL for the effect shaders. Every effect fragment shader sees the source image through `src(img)` where
// `img` is in image space (0..1, v = 0 at the TOP); targets store the image top at t = 1, hence the flip in `src`.
export const VERTEX = `#version 300 es
layout(location = 0) in vec2 a_unit;
out vec2 v_img;
void main() {
  v_img = a_unit;
  gl_Position = vec4(a_unit.x * 2.0 - 1.0, 1.0 - a_unit.y * 2.0, 0.0, 1.0);
}`;

const HEADER = `precision highp float;
in vec2 v_img;
uniform sampler2D u_tex;
uniform sampler2D u_tex1;
uniform vec2 u_texel;
out vec4 outColor;
vec4 src(vec2 img) { return texture(u_tex, vec2(img.x, 1.0 - img.y)); }
vec4 src1(vec2 img) { return texture(u_tex1, vec2(img.x, 1.0 - img.y)); }
`;

export const UNPREMULTIPLY = `vec3 unpremul(vec4 p) { return p.a > 0.0 ? p.rgb / p.a : vec3(0.0); }
`;

export const LUMA709 = `const vec3 LUMA = vec3(0.2126, 0.7152, 0.0722);
`;

export const SRGB = `vec3 srgbToLinear(vec3 c) { return mix(c / 12.92, pow((c + 0.055) / 1.055, vec3(2.4)), step(0.04045, c)); }
vec3 linearToSrgb(vec3 c) { return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c)); }
`;

export const HUE_ROTATE = `vec3 hueRotate(vec3 c, float deg) {
  float a = radians(deg);
  float cs = cos(a);
  float k = (1.0 - cs) / 3.0;
  float s = sin(a) * 0.57735026919;
  float d = cs + k;
  return vec3(d * c.r + (k - s) * c.g + (k + s) * c.b, (k + s) * c.r + d * c.g + (k - s) * c.b, (k - s) * c.r + (k + s) * c.g + d * c.b);
}
`;

export const HASH = `float hash11(float x) { return fract(sin(x * 12.9898) * 43758.5453); }
float hash21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;

/** A complete fragment shader. The `// fx:<key>` marker names the program (tests stub compile failures by it). */
export function fragment(key: string, chunks: string[], body: string): string {
  return `#version 300 es\n// fx:${key}\n${HEADER}${chunks.join('')}${body}`;
}
