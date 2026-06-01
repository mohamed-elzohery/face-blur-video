export const MAX_BOXES = 32;

export const WEBGL2_VERT = /* glsl */ `#version 300 es
out vec2 vUv;
const vec2 corners[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() {
  vec2 xy = corners[gl_VertexID];
  gl_Position = vec4(xy, 0.0, 1.0);
  vUv = vec2((xy.x + 1.0) * 0.5, (1.0 - xy.y) * 0.5);
}
`;

export const WEBGL2_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uTex;
uniform vec2 uRes;
uniform float uMinBlock;
uniform float uFeather;
uniform float uBlockFrac;
uniform int uBoxCount;
uniform int uStyle;
uniform vec4 uBoxes[${MAX_BOXES}];
in vec2 vUv;
out vec4 frag;
void main() {
  vec3 sharp = texture(uTex, vUv).rgb;
  float cov = 0.0;
  float sizePx = uMinBlock;
  for (int k = 0; k < ${MAX_BOXES}; k++) {
    if (k >= uBoxCount) break;
    vec4 b = uBoxes[k];
    vec2 center = b.xy + b.zw * 0.5;
    vec2 r = b.zw * 0.5;
    vec2 d = (vUv - center) / r;
    float dist = length(d);
    float minRPx = min(b.z * uRes.x, b.w * uRes.y) * 0.5;
    float f = uFeather / max(minRPx, 1.0);
    float c = 1.0 - smoothstep(1.0 - f, 1.0 + f, dist);
    if (c > cov) {
      cov = c;
      float bmd = min(b.z * uRes.x, b.w * uRes.y);
      sizePx = max(uMinBlock, bmd * uBlockFrac);
    }
  }
  vec3 effect = sharp;
  if (uStyle == 2) {
    effect = vec3(0.05, 0.05, 0.06);
  } else if (uStyle == 1) {
    vec2 step = max(sizePx, 2.0) / 2.0 / uRes;
    vec3 acc = vec3(0.0);
    float wsum = 0.0;
    for (int oy = -2; oy <= 2; oy++) {
      for (int ox = -2; ox <= 2; ox++) {
        float w = exp(-float(ox * ox + oy * oy) / 4.0);
        acc += texture(uTex, vUv + vec2(float(ox), float(oy)) * step).rgb * w;
        wsum += w;
      }
    }
    effect = acc / wsum;
  } else {
    float block = max(sizePx, 2.0);
    vec2 px = vUv * uRes;
    vec2 snapped = (floor(px / block) + vec2(0.5)) * block;
    effect = texture(uTex, snapped / uRes).rgb;
  }
  frag = vec4(mix(sharp, effect, clamp(cov, 0.0, 1.0)), 1.0);
}
`;

export const MOSAIC_WGSL = /* wgsl */ `
struct Params {
  resolution: vec2f,
  minBlockPx: f32,
  featherPx: f32,
  boxCount: f32,
  blockFrac: f32,
  style: f32,
  pad0: f32,
};

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;
@group(0) @binding(2) var<uniform> params: Params;
@group(0) @binding(3) var<uniform> boxes: array<vec4f, ${MAX_BOXES}>;

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

@fragment
fn fs(in: VSOut) -> @location(0) vec4f {
  let res = params.resolution;
  let sharp = textureSampleLevel(tex, samp, in.uv, 0.0);

  var cov = 0.0;
  var sizePx = params.minBlockPx;
  let n = u32(params.boxCount);
  for (var k: u32 = 0u; k < n; k = k + 1u) {
    let b = boxes[k];
    let center = b.xy + b.zw * 0.5;
    let r = b.zw * 0.5;
    let d = (in.uv - center) / r;
    let dist = length(d);
    let minRPx = min(b.z * res.x, b.w * res.y) * 0.5;
    let f = params.featherPx / max(minRPx, 1.0);
    let c = 1.0 - smoothstep(1.0 - f, 1.0 + f, dist);
    if (c > cov) {
      cov = c;
      let boxMinDim = min(b.z * res.x, b.w * res.y);
      sizePx = max(params.minBlockPx, boxMinDim * params.blockFrac);
    }
  }

  let style = i32(params.style);
  var effect = sharp.rgb;
  if (style == 2) {
    effect = vec3f(0.05, 0.05, 0.06);
  } else if (style == 1) {
    let step = max(sizePx, 2.0) / 2.0 / res;
    var acc = vec3f(0.0);
    var wsum = 0.0;
    for (var oy = -2; oy <= 2; oy = oy + 1) {
      for (var ox = -2; ox <= 2; ox = ox + 1) {
        let w = exp(-f32(ox * ox + oy * oy) / 4.0);
        acc += textureSampleLevel(tex, samp, in.uv + vec2f(f32(ox), f32(oy)) * step, 0.0).rgb * w;
        wsum += w;
      }
    }
    effect = acc / wsum;
  } else {
    let block = max(sizePx, 2.0);
    let px = in.uv * res;
    let snapped = (floor(px / block) + vec2f(0.5)) * block;
    effect = textureSampleLevel(tex, samp, snapped / res, 0.0).rgb;
  }

  return vec4f(mix(sharp.rgb, effect, clamp(cov, 0.0, 1.0)), 1.0);
}
`;
