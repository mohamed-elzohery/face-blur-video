export const BG_DOWNSCALE = 4;
export const BG_BLUR_ITERATIONS = 2;
export const BG_SOLID_COLOR: [number, number, number] = [0.05, 0.05, 0.06];

export function bgBlurStepTexels(radiusPx: number): number {
  return Math.max(0.5, radiusPx / BG_DOWNSCALE / 8);
}

export const BG_COPY_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
in vec2 vUv;
out vec4 frag;
void main() {
  frag = vec4(texture(uTex, vUv).rgb, 1.0);
}
`;

export const BG_BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uStep;
in vec2 vUv;
out vec4 frag;
void main() {
  vec3 acc = vec3(0.0);
  float wsum = 0.0;
  for (int i = -4; i <= 4; i++) {
    float w = exp(-float(i * i) / 8.0);
    acc += texture(uTex, vUv + float(i) * uStep).rgb * w;
    wsum += w;
  }
  frag = vec4(acc / wsum, 1.0);
}
`;

export const BG_COMPOSITE_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uFrame;
uniform sampler2D uBlur;
uniform sampler2D uMask;
uniform vec2 uRes;
uniform float uBlockPx;
uniform int uStyle;
in vec2 vUv;
out vec4 frag;
void main() {
  vec3 sharp = texture(uFrame, vUv).rgb;
  float a = smoothstep(0.2, 0.7, texture(uMask, vUv).r);
  vec3 effect;
  if (uStyle == 2) {
    effect = vec3(${BG_SOLID_COLOR.join(", ")});
  } else if (uStyle == 1) {
    effect = texture(uBlur, vUv).rgb;
  } else {
    float block = max(4.0, uBlockPx);
    vec2 px = vUv * uRes;
    vec2 snapped = (floor(px / block) + vec2(0.5)) * block;
    effect = texture(uFrame, snapped / uRes).rgb;
  }
  frag = vec4(mix(effect, sharp, a), 1.0);
}
`;

const WGSL_VS = /* wgsl */ `
struct VSOut {
  @builtin(position) pos: vec4f,
  @location(0) uv: vec2f,
};

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VSOut {
  var corners = array<vec2f, 3>(vec2f(-1.0, -1.0), vec2f(3.0, -1.0), vec2f(-1.0, 3.0));
  let xy = corners[vi];
  var out: VSOut;
  out.pos = vec4f(xy, 0.0, 1.0);
  out.uv = vec2f((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
  return out;
}
`;

export const BG_COPY_WGSL = /* wgsl */ `
@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
${WGSL_VS}
@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  return vec4f(textureSampleLevel(tex, samp, in.uv, 0.0).rgb, 1.0);
}
`;

export const BG_BLUR_WGSL = /* wgsl */ `
struct BlurParams {
  step: vec2f,
  pad: vec2f,
};

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: BlurParams;
${WGSL_VS}
@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  var acc = vec3f(0.0);
  var wsum = 0.0;
  for (var i = -4; i <= 4; i = i + 1) {
    let w = exp(-f32(i * i) / 8.0);
    acc += textureSampleLevel(tex, samp, in.uv + f32(i) * params.step, 0.0).rgb * w;
    wsum += w;
  }
  return vec4f(acc / wsum, 1.0);
}
`;

export const BG_COMPOSITE_WGSL = /* wgsl */ `
struct CompositeParams {
  res: vec2f,
  blockPx: f32,
  style: f32,
};

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var frameTex: texture_2d<f32>;
@group(0) @binding(2) var blurTex: texture_2d<f32>;
@group(0) @binding(3) var maskTex: texture_2d<f32>;
@group(0) @binding(4) var<uniform> params: CompositeParams;
${WGSL_VS}
@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let sharp = textureSampleLevel(frameTex, samp, in.uv, 0.0).rgb;
  let a = smoothstep(0.2, 0.7, textureSampleLevel(maskTex, samp, in.uv, 0.0).r);
  let style = i32(params.style);
  var effect: vec3f;
  if (style == 2) {
    effect = vec3f(${BG_SOLID_COLOR.join(", ")});
  } else if (style == 1) {
    effect = textureSampleLevel(blurTex, samp, in.uv, 0.0).rgb;
  } else {
    let block = max(4.0, params.blockPx);
    let px = in.uv * params.res;
    let snapped = (floor(px / block) + vec2f(0.5)) * block;
    effect = textureSampleLevel(frameTex, samp, snapped / params.res, 0.0).rgb;
  }
  return vec4f(mix(effect, sharp, a), 1.0);
}
`;
