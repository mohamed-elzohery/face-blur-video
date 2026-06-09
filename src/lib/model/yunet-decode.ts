import type { ScoredBox } from "@/lib/types";
import { iou } from "@/lib/coords";
import { logger } from "@/lib/log";

export const YUNET_STRIDES = [8, 16, 32] as const;

const NUM_KPS = 5;

export interface YuNetDetection extends ScoredBox {
  kps: { x: number; y: number }[];
}

let warnedKpsLayout = false;

export function decodeYuNet(
  outputs: Record<string, Float32Array>,
  inputW: number,
  inputH: number,
  scoreThreshold: number,
): YuNetDetection[] {
  const dets: YuNetDetection[] = [];

  for (const stride of YUNET_STRIDES) {
    const cls = outputs[`cls_${stride}`];
    const obj = outputs[`obj_${stride}`];
    const bbox = outputs[`bbox_${stride}`];
    if (!cls || !obj || !bbox) continue;

    const cols = Math.floor(inputW / stride);
    const rows = Math.floor(inputH / stride);

    const kpsOut = outputs[`kps_${stride}`];
    const hasKps = !!kpsOut && kpsOut.length >= cols * rows * NUM_KPS * 2;
    if (kpsOut && !hasKps && !warnedKpsLayout) {
      warnedKpsLayout = true;
      logger.warn(
        `YuNet kps_${stride} length ${kpsOut.length} != ${cols * rows * NUM_KPS * 2}; skipping landmark filter.`,
      );
    }

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const idx = r * cols + c;
        const clsv = Math.min(1, Math.max(0, cls[idx]));
        const objv = Math.min(1, Math.max(0, obj[idx]));
        const score = Math.sqrt(clsv * objv);
        if (score < scoreThreshold) continue;

        const o = idx * 4;
        const cx = (c + bbox[o]) * stride;
        const cy = (r + bbox[o + 1]) * stride;
        const w = Math.exp(bbox[o + 2]) * stride;
        const h = Math.exp(bbox[o + 3]) * stride;

        const kps: { x: number; y: number }[] = [];
        if (hasKps) {
          const ko = idx * NUM_KPS * 2;
          for (let k = 0; k < NUM_KPS; k++) {
            kps.push({
              x: (c + kpsOut[ko + 2 * k]) * stride,
              y: (r + kpsOut[ko + 2 * k + 1]) * stride,
            });
          }
        }

        dets.push({ x: cx - w / 2, y: cy - h / 2, w, h, score, kps });
      }
    }
  }

  return dets;
}

export function nms<T extends ScoredBox>(boxes: T[], iouThreshold: number, maxOut = 64): T[] {
  const sorted = [...boxes].sort((a, b) => b.score - a.score);
  const keep: T[] = [];
  for (const cand of sorted) {
    if (keep.length >= maxOut) break;
    let overlaps = false;
    for (const k of keep) {
      if (iou(cand, k) > iouThreshold) {
        overlaps = true;
        break;
      }
    }
    if (!overlaps) keep.push(cand);
  }
  return keep;
}
