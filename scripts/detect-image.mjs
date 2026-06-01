import * as ort from "onnxruntime-web";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const FFMPEG = require("ffmpeg-static");

ort.env.wasm.wasmPaths = resolve("public/ort") + "/";
ort.env.wasm.numThreads = 1;

const SIZE = 480;
const STRIDES = [8, 16, 32];

const rgb = new Uint8Array(
  execFileSync(
    FFMPEG,
    ["-hide_banner", "-loglevel", "error", "-i", "tests/fixtures/face.jpg", "-vf", `scale=${SIZE}:${SIZE}`, "-pix_fmt", "rgb24", "-f", "rawvideo", "pipe:1"],
    { maxBuffer: 1 << 30 },
  ),
);

function buildInput(order) {
  const plane = SIZE * SIZE;
  const input = new Float32Array(3 * plane);
  for (let p = 0, i = 0; p < plane; p++, i += 3) {
    const r = rgb[i];
    const g = rgb[i + 1];
    const b = rgb[i + 2];
    if (order === "bgr") {
      input[p] = b;
      input[plane + p] = g;
      input[2 * plane + p] = r;
    } else {
      input[p] = r;
      input[plane + p] = g;
      input[2 * plane + p] = b;
    }
  }
  return input;
}

function decode(out, threshold) {
  const boxes = [];
  for (const s of STRIDES) {
    const cls = out[`cls_${s}`].data;
    const obj = out[`obj_${s}`].data;
    const bbox = out[`bbox_${s}`].data;
    const cols = SIZE / s;
    const rows = SIZE / s;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const score = Math.sqrt(Math.min(1, Math.max(0, cls[idx])) * Math.min(1, Math.max(0, obj[idx])));
        if (score < threshold) continue;
        const o = idx * 4;
        const cx = (c + bbox[o]) * s;
        const cy = (r + bbox[o + 1]) * s;
        const w = Math.exp(bbox[o + 2]) * s;
        const h = Math.exp(bbox[o + 3]) * s;
        boxes.push({ x: cx - w / 2, y: cy - h / 2, w, h, score });
      }
  }
  return boxes.sort((a, b) => b.score - a.score).slice(0, 5);
}

const session = await ort.InferenceSession.create(readFileSync("public/models/face_detection_yunet_2026may.onnx"), {
  executionProviders: ["wasm"],
});

for (const order of ["bgr", "rgb"]) {
  const tensor = new ort.Tensor("float32", buildInput(order), [1, 3, SIZE, SIZE]);
  const out = await session.run({ [session.inputNames[0]]: tensor });
  const boxes = decode(out, 0.6);
  console.log(`\n=== ${order.toUpperCase()} (top boxes, det ${SIZE}px space, normalized) ===`);
  for (const b of boxes.slice(0, 3)) {
    console.log(
      `score=${b.score.toFixed(3)} norm=[${(b.x / SIZE).toFixed(3)}, ${(b.y / SIZE).toFixed(3)}, ${(b.w / SIZE).toFixed(3)}, ${(b.h / SIZE).toFixed(3)}]`,
    );
  }
  console.log(`count@0.6=${boxes.filter((b) => b.score >= 0.6).length}`);
}
