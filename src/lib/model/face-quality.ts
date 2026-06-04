import type { Box, FaceLandmarks } from "@/lib/types";

export interface QualityResult {
  eligible: boolean;
  q: number;
  reasons: string[];
}

export interface QualityInput {
  box: Box;
  score: number;
  W: number;
  H: number;
  landmarks?: FaceLandmarks;
  sharpness?: number;
}

export interface QualityThresholds {
  minFacePx: number;
  minConf: number;
  minSharpness: number;
  maxRollDeg: number;
  maxYawRatio: number;
}

export const DEFAULT_QUALITY_THRESHOLDS: QualityThresholds = {
  minFacePx: 40,
  minConf: 0.5,
  minSharpness: 50,
  maxRollDeg: 30,
  maxYawRatio: 0.6,
};

const VIS_THRESH = 0.3;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

interface Pose {
  rollDeg: number;
  yawRatio: number;
  usable: boolean;
}

function estimatePose(landmarks: FaceLandmarks | undefined, W: number, H: number): Pose {
  if (!landmarks || landmarks.pts.length < 3) return { rollDeg: 0, yawRatio: 0, usable: false };
  const vis = landmarks.vis;
  const [le, re, nose] = landmarks.pts;
  if (vis[0] < VIS_THRESH || vis[1] < VIS_THRESH || vis[2] < VIS_THRESH) {
    return { rollDeg: 0, yawRatio: 0, usable: false };
  }
  const lex = le[0] * W;
  const ley = le[1] * H;
  const rex = re[0] * W;
  const rey = re[1] * H;
  const nx = nose[0] * W;
  const rollDeg = (Math.atan2(rey - ley, rex - lex) * 180) / Math.PI;
  const eyeMidX = (lex + rex) / 2;
  const eyeSpan = Math.abs(rex - lex) + 1e-6;
  const yawRatio = Math.abs(nx - eyeMidX) / eyeSpan;
  return { rollDeg, yawRatio, usable: true };
}

export function faceQuality(
  input: QualityInput,
  thresholds: QualityThresholds = DEFAULT_QUALITY_THRESHOLDS,
): QualityResult {
  const { box, score, W, H, landmarks, sharpness } = input;
  const t = thresholds;
  const reasons: string[] = [];

  const facePx = Math.min(box.w * W, box.h * H);
  if (facePx < t.minFacePx) reasons.push("too-small");
  if (score < t.minConf) reasons.push("low-confidence");

  const pose = estimatePose(landmarks, W, H);
  if (pose.usable) {
    if (Math.abs(pose.rollDeg) > t.maxRollDeg) reasons.push("rolled");
    if (pose.yawRatio > t.maxYawRatio) reasons.push("yawed");
  }

  if (sharpness != null && sharpness < t.minSharpness) reasons.push("blurry");

  const sizeScore = clamp01(facePx / 120);
  const confScore = clamp01(score);
  const frontalScore = pose.usable
    ? clamp01(1 - Math.abs(pose.rollDeg) / t.maxRollDeg) *
      clamp01(1 - pose.yawRatio / t.maxYawRatio)
    : 1;
  const sharpScore = sharpness == null ? 1 : clamp01(sharpness / (t.minSharpness * 4));
  const q = 0.3 * sizeScore + 0.35 * confScore + 0.2 * frontalScore + 0.15 * sharpScore;

  return { eligible: reasons.length === 0, q, reasons };
}

export function laplacianVariance(img: {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
}): number {
  const { data, width, height } = img;
  if (width < 3 || height < 3) return 0;
  const gray = new Float32Array(width * height);
  for (let p = 0, i = 0; p < width * height; p++, i += 4) {
    gray[p] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }
  let sum = 0;
  let sumSq = 0;
  let count = 0;
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const lap =
        -4 * gray[idx] + gray[idx - 1] + gray[idx + 1] + gray[idx - width] + gray[idx + width];
      sum += lap;
      sumSq += lap * lap;
      count++;
    }
  }
  const mean = sum / count;
  return sumSq / count - mean * mean;
}
