import * as ort from "onnxruntime-web";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");

const SIZE = Number(process.env.SIZE ?? 640);
const ITERS = Number(process.env.ITERS ?? 20);
const WARMUP = Number(process.env.WARMUP ?? 3);
const THREADS = Number(process.env.ORT_THREADS ?? 1);
const SIMD = process.env.ORT_SIMD ?? "fixed";
const CLIP = process.env.CLIP ?? "tests/fixtures/face.jpg";
const SCORE = Number(process.env.SCORE ?? 0.35);
const NMS_IOU = 0.45;
const REG_MAX = 16;
const NUM_KPS = 5;
const VIS_THRESH = 0.3;

ort.env.wasm.wasmPaths = resolve(require.resolve("onnxruntime-web"), "..") + "/";
ort.env.wasm.numThreads = THREADS;
if (SIMD === "relaxed") ort.env.wasm.simd = "relaxed";
else if (SIMD === "off") ort.env.wasm.simd = false;
else ort.env.wasm.simd = true;

const fill = "0x727272";
const rgb = new Uint8Array(
  execFileSync(
    FFMPEG,
    [
      "-hide_banner", "-loglevel", "error", "-i", CLIP, "-frames:v", "1",
      "-vf", `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:color=${fill}`,
      "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1",
    ],
    { maxBuffer: 1 << 30 },
  ),
);

const area = SIZE * SIZE;
const input = new Float32Array(3 * area);
function repack() {
  for (let p = 0, i = 0; p < area; p++, i += 3) {
    input[p] = rgb[i] / 255;
    input[area + p] = rgb[i + 1] / 255;
    input[2 * area + p] = rgb[i + 2] / 255;
  }
}

function sigmoid(x) {
  return 1 / (1 + Math.exp(-x));
}

function dflChannel(data, startCh, idx, a) {
  let mx = -Infinity;
  for (let i = 0; i < REG_MAX; i++) {
    const v = data[(startCh + i) * a + idx];
    if (v > mx) mx = v;
  }
  let s = 0, ws = 0;
  for (let i = 0; i < REG_MAX; i++) {
    const e = Math.exp(data[(startCh + i) * a + idx] - mx);
    s += e;
    ws += e * i;
  }
  return ws / s;
}

function iou(a, b) {
  const ix = Math.max(a.x, b.x);
  const iy = Math.max(a.y, b.y);
  const ix2 = Math.min(a.x + a.w, b.x + b.w);
  const iy2 = Math.min(a.y + a.h, b.y + b.h);
  const iw = Math.max(0, ix2 - ix);
  const ih = Math.max(0, iy2 - iy);
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

function decodeHead(data, H, W, stride, threshold) {
  const a = H * W;
  const dets = [];
  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const conf = sigmoid(data[64 * a + idx]);
      if (conf < threshold) continue;
      const ax = c + 0.5;
      const ay = r + 0.5;
      const l = dflChannel(data, 0, idx, a);
      const t = dflChannel(data, REG_MAX, idx, a);
      const ri = dflChannel(data, 2 * REG_MAX, idx, a);
      const b = dflChannel(data, 3 * REG_MAX, idx, a);
      const x1 = Math.max(0, (ax - l) * stride);
      const y1 = Math.max(0, (ay - t) * stride);
      const x2 = Math.min(W * stride, (ax + ri) * stride);
      const y2 = Math.min(H * stride, (ay + b) * stride);
      const kps = [];
      for (let k = 0; k < NUM_KPS; k++) {
        const chBase = 65 + k * 3;
        kps.push({
          x: (data[chBase * a + idx] * 2 + (ax - 0.5)) * stride,
          y: (data[(chBase + 1) * a + idx] * 2 + (ay - 0.5)) * stride,
          vis: sigmoid(data[(chBase + 2) * a + idx]),
        });
      }
      dets.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, score: conf, kps });
    }
  }
  return dets;
}

function nms(dets, maxOut = 64) {
  const sorted = [...dets].sort((p, q) => q.score - p.score);
  const kept = [];
  for (const cand of sorted) {
    if (kept.length >= maxOut) break;
    let overlaps = false;
    for (const k of kept) {
      if (iou(cand, k) > NMS_IOU) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) kept.push(cand);
  }
  return kept;
}

function decodeAll(result, outputNames) {
  const all = [];
  for (const name of outputNames) {
    const t = result[name];
    const dims = t.dims;
    if (dims.length !== 4) continue;
    const H = dims[2], W = dims[3];
    all.push(...decodeHead(t.data, H, W, SIZE / H, SCORE));
  }
  return nms(all);
}

const session = await ort.InferenceSession.create(readFileSync("public/models/yolov8n-face.onnx"), {
  executionProviders: ["wasm"],
  graphOptimizationLevel: "all",
  enableCpuMemArena: true,
});
const inputName = session.inputNames[0];

repack();
for (let i = 0; i < WARMUP; i++) {
  await session.run({ [inputName]: new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]) });
}

let prepMs = 0, runMs = 0, decodeMs = 0;
let lastBoxes = [];
for (let i = 0; i < ITERS; i++) {
  const t0 = performance.now();
  repack();
  const tensor = new ort.Tensor("float32", input, [1, 3, SIZE, SIZE]);
  const t1 = performance.now();
  const result = await session.run({ [inputName]: tensor });
  const t2 = performance.now();
  lastBoxes = decodeAll(result, session.outputNames);
  const t3 = performance.now();
  prepMs += t1 - t0;
  runMs += t2 - t1;
  decodeMs += t3 - t2;
}

const perRun = (prepMs + runMs + decodeMs) / ITERS;
const visible = lastBoxes.filter((b) => b.kps.filter((k) => k.vis >= VIS_THRESH).length >= 2).length;
console.log(
  JSON.stringify(
    {
      clip: CLIP,
      size: SIZE,
      simd: SIMD,
      threads: THREADS,
      iters: ITERS,
      prepMsAvg: +(prepMs / ITERS).toFixed(2),
      runMsAvg: +(runMs / ITERS).toFixed(2),
      decodeMsAvg: +(decodeMs / ITERS).toFixed(2),
      totalMsAvg: +perRun.toFixed(2),
      detectFps: +(1000 / perRun).toFixed(1),
      boxes: lastBoxes.length,
      boxesWithLandmarks: visible,
      top: lastBoxes.slice(0, 5).map((b) => ({
        score: +b.score.toFixed(3),
        norm: [b.x / SIZE, b.y / SIZE, b.w / SIZE, b.h / SIZE].map((v) => +v.toFixed(3)),
      })),
    },
    null,
    2,
  ),
);
