import type { Box } from "@/lib/types";

export const FACE_LANDMARK_VIS_THRESH = 0.3;

export interface GeomPoint {
  x: number;
  y: number;
  vis?: number;
}

export function isPlausibleFaceGeometry(box: Box, kps: GeomPoint[]): boolean {
  if (kps.length < 5) return true;
  const isVisible = (p: GeomPoint) => (p.vis ?? 1) >= FACE_LANDMARK_VIS_THRESH;

  const { x, y, w, h } = box;
  const visible = kps.filter(isVisible);
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
  const eyeVis = (isVisible(le) ? 1 : 0) + (isVisible(re) ? 1 : 0);
  const noseVis = isVisible(nose);
  const mouthVis = (isVisible(lm) ? 1 : 0) + (isVisible(rm) ? 1 : 0);
  const tol = h * 0.2;

  if (eyeVis >= 1 && noseVis) {
    const eyeY = eyeVis === 2 ? (le.y + re.y) / 2 : isVisible(le) ? le.y : re.y;
    if (nose.y < eyeY - tol) return false;
  }

  if (noseVis && mouthVis >= 1) {
    const mouthY = isVisible(lm) ? lm.y : rm.y;
    if (mouthY < nose.y - tol) return false;
  }

  return true;
}
