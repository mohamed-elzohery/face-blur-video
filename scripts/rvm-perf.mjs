import * as ort from "onnxruntime-web";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");

const W = Number(process.env.W ?? 512);
const H = Number(process.env.H ?? 288);
const DS = Number(process.env.DS ?? Math.min(1, Math.max(0.125, 768 / Math.max(W, H))));
const ITERS = Number(process.env.ITERS ?? 20);
const WARMUP = Number(process.env.WARMUP ?? 2);
const THREADS = Number(process.env.ORT_THREADS ?? 4);
const SIMD = process.env.ORT_SIMD ?? "fixed";
const CLIP = process.env.CLIP ?? "tests/fixtures/face.jpg";

ort.env.wasm.wasmPaths = resolve(require.resolve("onnxruntime-web"), "..") + "/";
ort.env.wasm.numThreads = THREADS;
if (SIMD === "relaxed") ort.env.wasm.simd = "relaxed";
else if (SIMD === "off") ort.env.wasm.simd = false;
else ort.env.wasm.simd = true;

const rgb = new Uint8Array(
  execFileSync(
    FFMPEG,
    [
      "-hide_banner", "-loglevel", "error", "-i", CLIP, "-frames:v", "1",
      "-vf", `scale=${W}:${H}`,
      "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1",
    ],
    { maxBuffer: 1 << 30 },
  ),
);

const area = W * H;
const input = new Float32Array(3 * area);
function repack() {
  for (let p = 0, i = 0; p < area; p++, i += 3) {
    input[p] = rgb[i] / 255;
    input[area + p] = rgb[i + 1] / 255;
    input[2 * area + p] = rgb[i + 2] / 255;
  }
}

const session = await ort.InferenceSession.create(
  readFileSync("public/models/rvm_mobilenetv3_fp32.onnx"),
  {
    executionProviders: ["wasm"],
    graphOptimizationLevel: "all",
    enableCpuMemArena: true,
  },
);

const zero = () => new ort.Tensor("float32", new Float32Array(1), [1, 1, 1, 1]);
const dsTensor = new ort.Tensor("float32", Float32Array.of(DS), [1]);
const FETCHES = ["pha", "r1o", "r2o", "r3o", "r4o"];

let rec = { r1i: zero(), r2i: zero(), r3i: zero(), r4i: zero() };

async function runFrame() {
  const tensor = new ort.Tensor("float32", input, [1, 3, H, W]);
  const result = await session.run(
    { src: tensor, ...rec, downsample_ratio: dsTensor },
    FETCHES,
  );
  rec = { r1i: result.r1o, r2i: result.r2o, r3i: result.r3o, r4i: result.r4o };
  return result.pha;
}

repack();
for (let i = 0; i < WARMUP; i++) await runFrame();

let prepMs = 0, runMs = 0, decodeMs = 0;
let lastPha = null;
let lastStats = { mean: 0, fgFrac: 0 };
for (let i = 0; i < ITERS; i++) {
  const t0 = performance.now();
  repack();
  const t1 = performance.now();
  lastPha = await runFrame();
  const t2 = performance.now();
  const data = lastPha.data;
  let sum = 0, fg = 0;
  for (let p = 0; p < data.length; p++) {
    sum += data[p];
    if (data[p] > 0.5) fg++;
  }
  lastStats = { mean: sum / data.length, fgFrac: fg / data.length };
  const t3 = performance.now();
  prepMs += t1 - t0;
  runMs += t2 - t1;
  decodeMs += t3 - t2;
}

const perRun = (prepMs + runMs + decodeMs) / ITERS;
console.log(
  JSON.stringify(
    {
      clip: CLIP,
      width: W,
      height: H,
      downsampleRatio: +DS.toFixed(3),
      internal: [Math.round(W * DS), Math.round(H * DS)],
      simd: SIMD,
      threads: THREADS,
      iters: ITERS,
      inputNames: session.inputNames,
      outputNames: session.outputNames,
      stateDims: {
        r1: rec.r1i.dims,
        r2: rec.r2i.dims,
        r3: rec.r3i.dims,
        r4: rec.r4i.dims,
      },
      phaDims: lastPha.dims,
      phaMean: +lastStats.mean.toFixed(4),
      phaForegroundFrac: +lastStats.fgFrac.toFixed(4),
      prepMsAvg: +(prepMs / ITERS).toFixed(2),
      runMsAvg: +(runMs / ITERS).toFixed(2),
      decodeMsAvg: +(decodeMs / ITERS).toFixed(2),
      totalMsAvg: +perRun.toFixed(2),
      matteFps: +(1000 / perRun).toFixed(1),
    },
    null,
    2,
  ),
);
