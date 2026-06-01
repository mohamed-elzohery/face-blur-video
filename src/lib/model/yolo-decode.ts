import type { ScoredBox } from "@/lib/types";
import { iou } from "@/lib/coords";

const REG_MAX = 16;
const NUM_KPS = 5;
const VIS_THRESH = 0.3;

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

function validateLandmarks(det: YoloDetection): boolean {
  const { x, y, w, h, kps } = det;
  const visible = kps.filter((kp) => kp.vis >= VIS_THRESH);
  if (visible.length < 2) return true;

  const margin = 0.3;
  const x1e = x - w * margin;
  const y1e = y - h * margin;
  const x2e = x + w + w * margin;
  const y2e = y + h + h * margin;
  for (const kp of visible) {
    if (kp.x < x1e || kp.x > x2e || kp.y < y1e || kp.y > y2e) return false;
  }

  const [le, re, nose, lm, rm] = kps;
  const eyeVis = (le.vis >= VIS_THRESH ? 1 : 0) + (re.vis >= VIS_THRESH ? 1 : 0);
  const noseVis = nose.vis >= VIS_THRESH;
  const mouthVis = (lm.vis >= VIS_THRESH ? 1 : 0) + (rm.vis >= VIS_THRESH ? 1 : 0);
  const tol = h * 0.2;

  if (eyeVis >= 1 && noseVis) {
    const eyeY = eyeVis === 2 ? (le.y + re.y) / 2 : le.vis >= VIS_THRESH ? le.y : re.y;
    if (nose.y < eyeY - tol) return false;
  }

  if (noseVis && mouthVis >= 1) {
    const mouthY = lm.vis >= VIS_THRESH ? lm.y : rm.y;
    if (mouthY < nose.y - tol) return false;
  }

  return true;
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
          x: (Math.tanh(rawX) * 2 + ax) * stride,
          y: (Math.tanh(rawY) * 2 + ay) * stride,
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
  return kept.filter(validateLandmarks);
}
