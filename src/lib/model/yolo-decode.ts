import type { ScoredBox } from "@/lib/types";
import { iou } from "@/lib/coords";

const REG_MAX = 16;
const NUM_KPS = 5;

export interface YoloKeypoint {
  x: number;
  y: number;
  vis: number;
}

export interface YoloDetection extends ScoredBox {
  kps: YoloKeypoint[];
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

function dflChannel(data: Float32Array, startCh: number, idx: number, area: number): number {
  let mx = -Infinity;
  for (let i = 0; i < REG_MAX; i++) {
    const v = data[(startCh + i) * area + idx];
    if (v > mx) mx = v;
  }
  let s = 0, ws = 0;
  for (let i = 0; i < REG_MAX; i++) {
    const e = Math.exp(data[(startCh + i) * area + idx] - mx);
    s += e;
    ws += e * i;
  }
  return ws / s;
}

export function decodeYoloOutput(
  data: Float32Array,
  H: number,
  W: number,
  stride: number,
  scoreThreshold: number,
): YoloDetection[] {
  const area = H * W;
  const dets: YoloDetection[] = [];

  for (let r = 0; r < H; r++) {
    for (let c = 0; c < W; c++) {
      const idx = r * W + c;
      const conf = sigmoid(data[64 * area + idx]);
      if (conf < scoreThreshold) continue;

      const ax = c + 0.5;
      const ay = r + 0.5;
      const l = dflChannel(data, 0, idx, area);
      const t = dflChannel(data, REG_MAX, idx, area);
      const ri = dflChannel(data, 2 * REG_MAX, idx, area);
      const b = dflChannel(data, 3 * REG_MAX, idx, area);

      const inputW = W * stride;
      const inputH = H * stride;
      const x1 = Math.max(0, (ax - l) * stride);
      const y1 = Math.max(0, (ay - t) * stride);
      const x2 = Math.min(inputW, (ax + ri) * stride);
      const y2 = Math.min(inputH, (ay + b) * stride);

      const kps: YoloKeypoint[] = [];
      for (let k = 0; k < NUM_KPS; k++) {
        const chBase = 65 + k * 3;
        const rawX = data[chBase * area + idx];
        const rawY = data[(chBase + 1) * area + idx];
        const rawV = data[(chBase + 2) * area + idx];
        kps.push({
          x: (rawX * 2 + (ax - 0.5)) * stride,
          y: (rawY * 2 + (ay - 0.5)) * stride,
          vis: sigmoid(rawV),
        });
      }

      dets.push({ x: x1, y: y1, w: x2 - x1, h: y2 - y1, score: conf, kps });
    }
  }

  return dets;
}

export function nmsYolo(dets: YoloDetection[], iouThreshold: number, maxOut = 64): YoloDetection[] {
  const sorted = [...dets].sort((a, b) => b.score - a.score);
  const kept: YoloDetection[] = [];
  for (const cand of sorted) {
    if (kept.length >= maxOut) break;
    let overlaps = false;
    for (const k of kept) {
      if (iou(cand, k) > iouThreshold) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) kept.push(cand);
  }
  return kept;
}
