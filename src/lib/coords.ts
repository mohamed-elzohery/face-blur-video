import type { Box } from "./types";

export interface DetectLayout {
  detW: number;
  detH: number;
  scaledW: number;
  scaledH: number;
  scale: number;
}

export function computeDetectLayout(
  encodeW: number,
  encodeH: number,
  longSide: number,
): DetectLayout {
  const scale = Math.min(1, longSide / Math.max(encodeW, encodeH));
  const scaledW = Math.max(1, Math.round(encodeW * scale));
  const scaledH = Math.max(1, Math.round(encodeH * scale));
  const detW = Math.max(32, Math.ceil(scaledW / 32) * 32);
  const detH = Math.max(32, Math.ceil(scaledH / 32) * 32);
  return { detW, detH, scaledW, scaledH, scale };
}

export function detBoxToNormalized(
  x: number,
  y: number,
  w: number,
  h: number,
  layout: DetectLayout,
  encodeW: number,
  encodeH: number,
): Box {
  return {
    x: x / layout.scale / encodeW,
    y: y / layout.scale / encodeH,
    w: w / layout.scale / encodeW,
    h: h / layout.scale / encodeH,
  };
}

export function padBox(box: Box, frac: number): Box {
  const padX = box.w * frac;
  const padY = box.h * frac;
  let x = box.x - padX / 2;
  let y = box.y - padY / 2;
  let w = box.w + padX;
  let h = box.h + padY;
  if (x < 0) {
    w += x;
    x = 0;
  }
  if (y < 0) {
    h += y;
    y = 0;
  }
  if (x + w > 1) w = 1 - x;
  if (y + h > 1) h = 1 - y;
  return { x, y, w: Math.max(0, w), h: Math.max(0, h) };
}

export function iou(a: Box, b: Box): number {
  const ax2 = a.x + a.w;
  const ay2 = a.y + a.h;
  const bx2 = b.x + b.w;
  const by2 = b.y + b.h;
  const ix = Math.max(a.x, b.x);
  const iy = Math.max(a.y, b.y);
  const ix2 = Math.min(ax2, bx2);
  const iy2 = Math.min(ay2, by2);
  const iw = Math.max(0, ix2 - ix);
  const ih = Math.max(0, iy2 - iy);
  const inter = iw * ih;
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}
